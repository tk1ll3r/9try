-- Online presence: whether the app has lately seen an open session of a person.
--
-- It is a different thing from an activity mode (what someone says they are doing) and from a shared
-- location (where they are). A web app cannot know that a phone is on, or that its owner is looking
-- at another app, so the words on screen are "the app is open" and "last opened", never "online".
--
-- Nobody is shown by default. A person chooses who may see them: nobody, every friend, or the friends
-- they pick, and separately whether the time they were last seen is kept at all.
--
-- What is stored: one row per open tab or device, written again every 30 seconds while the app is on
-- screen and dropped 15 minutes after its last sign of life, and one time of last activity per person,
-- kept only while they chose to show it. There is no history of when someone was active.

create table public.presence_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  audience text not null default 'nobody' check (audience in ('nobody', 'friends', 'selected')),
  show_last_active boolean not null default false,
  -- Empty unless show_last_active is on.
  last_active_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The friends who may see a person whose audience is 'selected'.
create table public.presence_viewers (
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  primary key (user_id, viewer_id)
);

create table public.presence_sessions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Made by the device, one for each tab that is open.
  session_id uuid not null,
  seen_at timestamptz not null default now(),
  -- Set when the tab says it is going away, so the person need not wait for the 90 seconds to pass.
  ended boolean not null default false,
  primary key (user_id, session_id)
);

alter table public.presence_settings enable row level security;
alter table public.presence_viewers enable row level security;
alter table public.presence_sessions enable row level security;
revoke all on public.presence_settings, public.presence_viewers, public.presence_sessions from anon, authenticated;
grant select on public.presence_settings, public.presence_viewers to authenticated;

-- A person reads their own choices. Everything else goes through the functions below; nobody reads
-- the sessions table directly.
create policy presence_settings_owner_read on public.presence_settings
for select to authenticated using (user_id = (select auth.uid()));
create policy presence_viewers_owner_read on public.presence_viewers
for select to authenticated using (user_id = (select auth.uid()));

-- Whether `p_viewer` may see the presence of `p_owner` right now. Looked up on every read, so a
-- change of the setting, an unfriending and a block all take effect on the next read.
create function private.may_see_presence(p_owner uuid, p_viewer uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.presence_settings s
    where s.user_id = p_owner
      and private.can_contact(p_owner, p_viewer)
      and (s.audience = 'friends'
        or (s.audience = 'selected' and exists(
          select 1 from public.presence_viewers v where v.user_id = p_owner and v.viewer_id = p_viewer))))
$$;

create function private.is_active_now(p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.presence_sessions x
    where x.user_id = p_user_id and not x.ended and x.seen_at > now() - interval '90 seconds')
$$;

-- Tells the person's own devices and the friends who may see them to reload. A friend who may not
-- see them hears nothing: the moment of an event would itself say when the app was opened.
create function private.emit_presence(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit(p_user_id, 'presence');
  perform private.emit(friends.friend_id, 'presence')
  from (
    select case when f.requester_id = p_user_id then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f
    where f.status = 'accepted' and p_user_id in (f.requester_id, f.addressee_id)
  ) friends
  where private.may_see_presence(p_user_id, friends.friend_id);
end $$;

-- Who may see the person, and whether the time they were last seen is kept. Turning sharing off
-- forgets the open sessions and the last time at once.
create function public.set_presence_sharing(p_audience text, p_viewer_ids uuid[] default '{}', p_show_last_active boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); seen_by uuid[]; viewers uuid[]; told uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_audience is null or p_audience not in ('nobody', 'friends', 'selected') then raise exception 'invalid audience'; end if;

  select coalesce(array_agg(p.id), '{}') into viewers
  from public.profiles p
  where p_audience = 'selected' and p.id = any(p_viewer_ids) and private.can_contact(me, p.id);
  if p_audience = 'selected' and cardinality(viewers) = 0 then raise exception 'no valid recipients'; end if;

  -- The friends who could see the person until now are told as well, so that their screens let go.
  select coalesce(array_agg(friend_id), '{}') into seen_by
  from (
    select case when f.requester_id = me then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f where f.status = 'accepted' and me in (f.requester_id, f.addressee_id)
  ) friends
  where private.may_see_presence(me, friend_id);

  insert into public.presence_settings(user_id, audience, show_last_active, last_active_at, updated_at)
  values (me, p_audience, p_audience <> 'nobody' and coalesce(p_show_last_active, false), null, now())
  on conflict (user_id) do update set
    audience = excluded.audience,
    show_last_active = excluded.show_last_active,
    last_active_at = case when excluded.show_last_active then public.presence_settings.last_active_at end,
    updated_at = now();

  delete from public.presence_viewers where user_id = me;
  insert into public.presence_viewers(user_id, viewer_id) select me, unnest(viewers);
  if p_audience = 'nobody' then delete from public.presence_sessions where user_id = me; end if;

  perform private.emit_presence(me);
  foreach told in array seen_by loop
    if not private.may_see_presence(me, told) then perform private.emit(told, 'presence'); end if;
  end loop;
end $$;

-- "This session is open." Called every 30 seconds while the app is on screen. Returns false when the
-- person does not share their presence; the app then stops calling.
create function public.presence_heartbeat(p_session_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); chosen public.presence_settings%rowtype; was_active boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_session_id is null then raise exception 'invalid session'; end if;
  select * into chosen from public.presence_settings where user_id = me;
  if chosen.user_id is null or chosen.audience = 'nobody' then return false; end if;

  delete from public.presence_sessions where user_id = me and seen_at < now() - interval '15 minutes';
  was_active := private.is_active_now(me);
  -- A device has a handful of tabs. More rows than that is someone filling the table.
  if not exists(select 1 from public.presence_sessions where user_id = me and session_id = p_session_id)
     and (select count(*) from public.presence_sessions where user_id = me) >= 10 then
    raise exception 'too many sessions';
  end if;

  insert into public.presence_sessions(user_id, session_id) values (me, p_session_id)
  on conflict (user_id, session_id) do update set seen_at = now(), ended = false;
  if chosen.show_last_active then
    update public.presence_settings set last_active_at = now() where user_id = me;
  end if;

  -- Friends are told when the person appears, not on every beat.
  if not was_active then perform private.emit_presence(me); end if;
  return true;
end $$;

-- "This session is going away": the tab was hidden or closed, or the person signed out. Another tab
-- or device that is still open keeps the person active.
create function public.presence_leave(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  update public.presence_sessions set ended = true
  where user_id = me and session_id = p_session_id and not ended;
  if found and not private.is_active_now(me) then perform private.emit_presence(me); end if;
end $$;

-- The friends who let the caller see them, each with one of three states: 'active' (a session gave
-- a sign of life in the last 90 seconds), 'recent' (in the last 15 minutes) or 'idle'. The last time
-- comes only from a friend who chose to show it. A friend who is not in the result does not share
-- their presence with the caller: the app shows "status unavailable", never "offline".
create function public.list_friend_presence()
returns table(user_id uuid, state text, last_active_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.user_id,
    case when private.is_active_now(s.user_id) then 'active'
         when exists(select 1 from public.presence_sessions x where x.user_id = s.user_id and x.seen_at > now() - interval '15 minutes') then 'recent'
         else 'idle' end,
    case when s.show_last_active then s.last_active_at end
  from public.friendships f
  join public.presence_settings s
    on s.user_id = case when f.requester_id = (select auth.uid()) then f.addressee_id else f.requester_id end
  where f.status = 'accepted' and (select auth.uid()) in (f.requester_id, f.addressee_id)
    and private.may_see_presence(s.user_id, (select auth.uid()))
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.set_presence_sharing(text, uuid[], boolean)', 'public.presence_heartbeat(uuid)',
    'public.presence_leave(uuid)', 'public.list_friend_presence()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Unfriending or blocking ends what the two shared (migrations 0015 and 0028). Being picked as a
-- viewer of someone's presence goes the same way, and both screens are told to reload.
create or replace function private.revoke_relationship_grants(a uuid, b uuid) returns void
language sql set search_path = '' as $$
  delete from public.availability_shares s
  where (s.owner_id = a and s.user_id = b) or (s.owner_id = b and s.user_id = a);

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id = s.id
    and ((s.owner_id = a and r.user_id = b) or (s.owner_id = b and r.user_id = a));

  delete from public.event_shares e
  using public.calendar_events c
  where e.event_id = c.id
    and ((c.owner_id = a and e.user_id = b) or (c.owner_id = b and e.user_id = a));

  delete from public.friend_pins p
  where (p.user_id = a and p.friend_id = b) or (p.user_id = b and p.friend_id = a);

  delete from public.presence_viewers v
  where (v.user_id = a and v.viewer_id = b) or (v.user_id = b and v.viewer_id = a);

  select private.emit(a, 'presence');
  select private.emit(b, 'presence');
$$;

-- Sessions that gave no sign of life for 15 minutes are of no use to anyone.
create function private.purge_stale_presence() returns void
language sql set search_path = '' as $$
  delete from public.presence_sessions where seen_at < now() - interval '15 minutes';
$$;

do $$
begin
  perform cron.schedule('purge-stale-presence', '*/5 * * * *', 'select private.purge_stale_presence()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Old presence sessions are then removed when their owner opens the app again.', sqlerrm;
end $$;
