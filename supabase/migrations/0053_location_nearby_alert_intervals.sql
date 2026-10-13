-- Recheck nearby pairs when sharing or alert preferences change, and make repeat alerts configurable.
alter table public.location_nearby_preferences
  add column repeat_minutes integer not null default 30
  check (repeat_minutes in (5, 10, 15, 30, 60));

drop function public.get_location_nearby_preference();
create function public.get_location_nearby_preference()
returns table(enabled boolean, radius_m integer, repeat_minutes integer)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.enabled, false), coalesce(p.radius_m, 500), coalesce(p.repeat_minutes, 30)
  from (select (select auth.uid()) as user_id) me
  left join public.location_nearby_preferences p on p.user_id = me.user_id
$$;
revoke all on function public.get_location_nearby_preference() from public, anon;
grant execute on function public.get_location_nearby_preference() to authenticated;

drop function public.save_location_nearby_preference(boolean, integer);
create function public.save_location_nearby_preference(
  p_enabled boolean,
  p_radius_m integer,
  p_repeat_minutes integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  pair record;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_radius_m not in (250, 500, 1000, 2000) then raise exception 'invalid radius'; end if;
  if p_repeat_minutes not in (5, 10, 15, 30, 60) then raise exception 'invalid repeat interval'; end if;

  insert into public.location_nearby_preferences(user_id, enabled, radius_m, repeat_minutes, updated_at)
  values (me, p_enabled, p_radius_m, p_repeat_minutes, now())
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    radius_m = excluded.radius_m,
    repeat_minutes = excluded.repeat_minutes,
    updated_at = now();

  -- Evaluate existing shares now, including when this setting was just switched on.
  for pair in
    select distinct s.owner_id, r.user_id as friend_id
    from public.location_sessions s
    join public.location_recipients r on r.session_id = s.id
    where (s.owner_id = me or r.user_id = me)
      and s.stopped_at is null and s.expires_at > now()
  loop
    perform private.refresh_location_nearby_pair(pair.owner_id, pair.friend_id);
  end loop;
end $$;
revoke all on function public.save_location_nearby_preference(boolean, integer, integer) from public, anon;
grant execute on function public.save_location_nearby_preference(boolean, integer, integer) to authenticated;

create function private.set_location_nearby_state(
  p_user_id uuid,
  p_friend_id uuid,
  p_inside boolean,
  p_repeat_minutes integer
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  checked_at timestamptz := clock_timestamp();
  should_notify boolean;
begin
  insert into public.location_nearby_state(user_id, friend_id, inside, entered_at, last_notified_at)
  values (
    p_user_id,
    p_friend_id,
    p_inside,
    case when p_inside then checked_at else null end,
    case when p_inside then checked_at else null end
  )
  on conflict (user_id, friend_id) do update
    set inside = excluded.inside,
        entered_at = case
          when excluded.inside and not state.inside then checked_at
          when excluded.inside then state.entered_at
          else null
        end,
        last_notified_at = case
          when excluded.inside and (
            state.last_notified_at is null
            or state.last_notified_at <= checked_at - make_interval(mins => p_repeat_minutes)
          ) then checked_at
          else state.last_notified_at
        end
    where state.inside is distinct from excluded.inside
      or (excluded.inside and (
        state.last_notified_at is null
        or state.last_notified_at <= checked_at - make_interval(mins => p_repeat_minutes)
      ))
  returning state.inside and state.last_notified_at = checked_at into should_notify;
  return coalesce(should_notify, false) and p_inside;
end $$;
revoke all on function private.set_location_nearby_state(uuid, uuid, boolean, integer) from public, anon, authenticated;

create function private.refresh_location_nearby_pair(p_user_id uuid, p_friend_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  pair record;
  target record;
  fresh_and_precise boolean;
  within_radius boolean;
  meters double precision;
begin
  if p_user_id is null or p_friend_id is null or p_user_id = p_friend_id then return; end if;

  select
    a.approximate as owner_approximate,
    owner_position.latitude as owner_latitude,
    owner_position.longitude as owner_longitude,
    owner_position.accuracy_m as owner_accuracy,
    owner_position.recorded_at as owner_recorded_at,
    friend_session.approximate as friend_approximate,
    friend_session.latitude as friend_latitude,
    friend_session.longitude as friend_longitude,
    friend_session.accuracy_m as friend_accuracy,
    friend_session.recorded_at as friend_recorded_at,
    owner_pref.radius_m as owner_radius,
    owner_pref.repeat_minutes as owner_repeat_minutes,
    friend_pref.radius_m as friend_radius,
    friend_pref.repeat_minutes as friend_repeat_minutes
  into pair
  from public.location_sessions a
  join public.location_recipients owner_share on owner_share.session_id = a.id and owner_share.user_id = p_friend_id
  left join public.location_positions owner_position on owner_position.session_id = a.id
  join lateral (
    select s.approximate, s.created_at, pos.latitude, pos.longitude, pos.accuracy_m, pos.recorded_at
    from public.location_sessions s
    join public.location_recipients reciprocal_share on reciprocal_share.session_id = s.id and reciprocal_share.user_id = p_user_id
    left join public.location_positions pos on pos.session_id = s.id
    where s.owner_id = p_friend_id and s.stopped_at is null and s.expires_at > now()
    order by s.created_at desc
    limit 1
  ) friend_session on true
  join public.location_nearby_preferences owner_pref on owner_pref.user_id = p_user_id and owner_pref.enabled
  join public.location_nearby_preferences friend_pref on friend_pref.user_id = p_friend_id and friend_pref.enabled
  where a.owner_id = p_user_id and a.stopped_at is null and a.expires_at > now()
    and private.can_contact(p_user_id, p_friend_id)
  order by a.created_at desc
  limit 1;

  if not found then
    perform private.set_location_nearby_state(p_user_id, p_friend_id, false, 30);
    perform private.set_location_nearby_state(p_friend_id, p_user_id, false, 30);
    return;
  end if;

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
    select p_user_id as user_id, p_friend_id as friend_id, pair.owner_radius as radius_m,
      pair.owner_repeat_minutes as repeat_minutes
    union all
    select p_friend_id, p_user_id, pair.friend_radius, pair.friend_repeat_minutes
  loop
    within_radius := coalesce(fresh_and_precise and meters is not null
      and meters + pair.owner_accuracy + pair.friend_accuracy <= target.radius_m, false);
    if private.set_location_nearby_state(target.user_id, target.friend_id, within_radius, target.repeat_minutes) then
      perform private.notify(target.user_id, 'location_nearby',
        'Bạn đang gần ' || private.display_name_of(target.friend_id),
        'Cả hai đang ở trong phạm vi khoảng ' || target.radius_m::text || ' m.', '/me/location',
        'locnear:' || target.user_id::text || ':' || target.friend_id::text || ':' || gen_random_uuid()::text);
    end if;
  end loop;
end $$;
revoke all on function private.refresh_location_nearby_pair(uuid, uuid) from public, anon, authenticated;

create or replace function private.track_location_nearby() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  friend_id uuid;
begin
  select s.owner_id into owner_id
  from public.location_sessions s
  where s.id = new.session_id and s.stopped_at is null and s.expires_at > now();
  if owner_id is null then return null; end if;

  for friend_id in
    select r.user_id from public.location_recipients r where r.session_id = new.session_id
  loop
    perform private.refresh_location_nearby_pair(owner_id, friend_id);
  end loop;
  return null;
end $$;
revoke all on function private.track_location_nearby() from public, anon, authenticated;

create or replace function private.reset_location_nearby_on_share_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  owner_id uuid;
  friend_id uuid;
begin
  if tg_table_name = 'location_sessions' then
    sid := coalesce(new.id, old.id);
    select s.owner_id into owner_id from public.location_sessions s where s.id = sid;
    if owner_id is null and tg_op = 'DELETE' then owner_id := old.owner_id; end if;
    if owner_id is not null then
      for friend_id in
        select r.user_id from public.location_recipients r where r.session_id = sid
      loop
        perform private.refresh_location_nearby_pair(owner_id, friend_id);
      end loop;
    end if;
  else
    sid := coalesce(new.session_id, old.session_id);
    friend_id := coalesce(new.user_id, old.user_id);
    select s.owner_id into owner_id from public.location_sessions s where s.id = sid;
    if owner_id is not null then
      perform private.refresh_location_nearby_pair(owner_id, friend_id);
    end if;
  end if;
  return null;
end $$;
revoke all on function private.reset_location_nearby_on_share_change() from public, anon, authenticated;

drop function private.set_location_nearby_state(uuid, uuid, boolean);
