-- Longer location shares and opt-in nearby alerts.

-- `infinity` means the share stays active until its owner stops it. The flag lets clients display
-- that intent explicitly while the usual active-session checks continue to work.
alter table public.location_sessions
  add column if not exists permanent boolean not null default false;

create or replace function public.start_location_session_for(
  p_duration_minutes integer,
  p_recipient_ids uuid[],
  p_approximate boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid; recipients uuid[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_duration_minutes is null or (p_duration_minutes <> 0 and (p_duration_minutes < 5 or p_duration_minutes > 43200)) then
    raise exception 'invalid duration';
  end if;

  select array_agg(p.id order by p.id) into recipients
  from public.profiles p
  where p.id = any(coalesce(p_recipient_ids, '{}'::uuid[])) and private.can_contact(auth.uid(), p.id);
  if recipients is null then raise exception 'no valid recipients'; end if;

  perform private.purge_ended_location_positions();

  insert into public.location_sessions(owner_id, expires_at, approximate, permanent)
  values (auth.uid(), case when p_duration_minutes = 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_duration_minutes) end,
    p_approximate, p_duration_minutes = 0)
  returning id into sid;

  insert into public.location_recipients(session_id, user_id)
  select sid, unnest(recipients);

  return sid;
end $$;
revoke execute on function public.start_location_session_for(integer, uuid[], boolean) from public, anon;
grant execute on function public.start_location_session_for(integer, uuid[], boolean) to authenticated;

-- Nearby alerts are off by default. Both friends must opt in and actively share their location
-- with each other; approximate sessions are not used. The stored state sends only on entry.
create table public.location_nearby_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  radius_m integer not null default 500 check (radius_m in (250, 500, 1000, 2000)),
  updated_at timestamptz not null default now()
);

create table public.location_nearby_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  inside boolean not null default false,
  entered_at timestamptz,
  last_notified_at timestamptz,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

alter table public.location_nearby_preferences enable row level security;
alter table public.location_nearby_state enable row level security;
revoke all on public.location_nearby_preferences, public.location_nearby_state from public, anon, authenticated;

create function public.get_location_nearby_preference()
returns table(enabled boolean, radius_m integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.enabled, false), coalesce(p.radius_m, 500)
  from (select (select auth.uid()) as user_id) me
  left join public.location_nearby_preferences p on p.user_id = me.user_id
$$;
revoke all on function public.get_location_nearby_preference() from public, anon;
grant execute on function public.get_location_nearby_preference() to authenticated;

create function public.save_location_nearby_preference(p_enabled boolean, p_radius_m integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_radius_m not in (250, 500, 1000, 2000) then raise exception 'invalid radius'; end if;
  insert into public.location_nearby_preferences(user_id, enabled, radius_m, updated_at)
  values (me, p_enabled, p_radius_m, now())
  on conflict (user_id) do update set enabled = excluded.enabled, radius_m = excluded.radius_m, updated_at = now();
  delete from public.location_nearby_state where user_id = me or friend_id = me;
end $$;
revoke all on function public.save_location_nearby_preference(boolean, integer) from public, anon;
grant execute on function public.save_location_nearby_preference(boolean, integer) to authenticated;

create function private.location_distance_meters(lat_a double precision, lon_a double precision, lat_b double precision, lon_b double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 6371000.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
    sin(radians(lat_b - lat_a) / 2) * sin(radians(lat_b - lat_a) / 2)
    + cos(radians(lat_a)) * cos(radians(lat_b)) * sin(radians(lon_b - lon_a) / 2) * sin(radians(lon_b - lon_a) / 2)
  ))))
$$;

create function private.set_location_nearby_state(p_user_id uuid, p_friend_id uuid, p_inside boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed boolean := false;
begin
  insert into public.location_nearby_state(user_id, friend_id, inside, entered_at, last_notified_at)
  values (p_user_id, p_friend_id, p_inside, case when p_inside then now() else null end, case when p_inside then now() else null end)
  on conflict (user_id, friend_id) do update
    set inside = excluded.inside,
        entered_at = case when excluded.inside then now() else null end,
        last_notified_at = case when excluded.inside
          and (public.location_nearby_state.last_notified_at is null
            or public.location_nearby_state.last_notified_at <= now() - interval '30 minutes')
          then now() else public.location_nearby_state.last_notified_at end
    where public.location_nearby_state.inside is distinct from excluded.inside
  returning inside and entered_at = last_notified_at into changed;
  return coalesce(changed, false) and p_inside;
end $$;

create function private.track_location_nearby() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  pair record;
  target record;
  meters double precision;
  fresh_and_precise boolean;
  within_radius boolean;
begin
  for pair in
    select a.owner_id as owner_id, r.user_id as friend_id,
      a.approximate as owner_approximate, new.latitude as owner_latitude, new.longitude as owner_longitude,
      new.accuracy_m as owner_accuracy, new.recorded_at as owner_recorded_at,
      b.approximate as friend_approximate, b.latitude as friend_latitude, b.longitude as friend_longitude,
      b.accuracy_m as friend_accuracy, b.recorded_at as friend_recorded_at,
      owner_pref.radius_m as owner_radius, friend_pref.radius_m as friend_radius
    from public.location_sessions a
    join public.location_recipients r on r.session_id = a.id
    join public.location_nearby_preferences owner_pref on owner_pref.user_id = a.owner_id and owner_pref.enabled
    join public.location_nearby_preferences friend_pref on friend_pref.user_id = r.user_id and friend_pref.enabled
    join lateral (
      select s.approximate, pos.latitude, pos.longitude, pos.accuracy_m, pos.recorded_at
      from public.location_sessions s
      join public.location_recipients reciprocal on reciprocal.session_id = s.id and reciprocal.user_id = a.owner_id
      left join public.location_positions pos on pos.session_id = s.id
      where s.owner_id = r.user_id and s.stopped_at is null and s.expires_at > now()
      order by pos.recorded_at desc nulls last, s.created_at desc
      limit 1
    ) b on true
    where a.id = new.session_id and a.stopped_at is null and a.expires_at > now()
    order by r.user_id
  loop
    fresh_and_precise := coalesce(
      pair.owner_recorded_at >= now() - interval '2 minutes'
      and pair.owner_recorded_at <= now() + interval '1 minute'
      and pair.friend_recorded_at >= now() - interval '2 minutes'
      and pair.friend_recorded_at <= now() + interval '1 minute'
      and not pair.owner_approximate and not pair.friend_approximate
      and pair.owner_accuracy between 0 and 100 and pair.friend_accuracy between 0 and 100,
      false
    );

    meters := case when pair.owner_latitude is null or pair.friend_latitude is null then null
      else private.location_distance_meters(pair.owner_latitude, pair.owner_longitude, pair.friend_latitude, pair.friend_longitude) end;

    for target in
      select pair.owner_id as user_id, pair.friend_id as friend_id, pair.owner_radius as radius_m
      union all
      select pair.friend_id, pair.owner_id, pair.friend_radius
    loop
      within_radius := coalesce(fresh_and_precise and meters is not null
        and meters + pair.owner_accuracy + pair.friend_accuracy <= target.radius_m, false);
      if private.set_location_nearby_state(target.user_id, target.friend_id, within_radius) then
        perform private.notify(target.user_id, 'location_nearby', 'Bạn đang gần ' || private.display_name_of(target.friend_id),
          'Cả hai đang ở trong phạm vi khoảng ' || target.radius_m::text || ' m.', '/me/location',
          'locnear:' || target.user_id::text || ':' || target.friend_id::text || ':' || gen_random_uuid()::text);
      end if;
    end loop;
  end loop;
  return null;
end $$;
revoke all on function private.track_location_nearby() from public, anon, authenticated;
drop trigger if exists location_positions_nearby on public.location_positions;
create trigger location_positions_nearby after insert or update on public.location_positions
for each row execute function private.track_location_nearby();

create function private.reset_location_nearby_on_share_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare sid uuid; owner uuid; friend uuid;
begin
  if tg_table_name = 'location_sessions' then
    sid := coalesce(new.id, old.id);
    select s.owner_id into owner from public.location_sessions s where s.id = sid;
    if owner is not null then
      update public.location_nearby_state n set inside = false, entered_at = null
      where (n.user_id = owner and n.friend_id in (select r.user_id from public.location_recipients r where r.session_id = sid))
         or (n.friend_id = owner and n.user_id in (select r.user_id from public.location_recipients r where r.session_id = sid));
    end if;
  else
    sid := coalesce(new.session_id, old.session_id);
    friend := coalesce(new.user_id, old.user_id);
    select s.owner_id into owner from public.location_sessions s where s.id = sid;
    if owner is not null then
      update public.location_nearby_state n set inside = false, entered_at = null
      where (n.user_id = owner and n.friend_id = friend) or (n.user_id = friend and n.friend_id = owner);
    end if;
  end if;
  return null;
end $$;
revoke all on function private.reset_location_nearby_on_share_change() from public, anon, authenticated;
drop trigger if exists location_nearby_session_reset on public.location_sessions;
create trigger location_nearby_session_reset after insert or update on public.location_sessions
for each row execute function private.reset_location_nearby_on_share_change();
drop trigger if exists location_nearby_recipient_reset on public.location_recipients;
create trigger location_nearby_recipient_reset after insert or delete on public.location_recipients
for each row execute function private.reset_location_nearby_on_share_change();
