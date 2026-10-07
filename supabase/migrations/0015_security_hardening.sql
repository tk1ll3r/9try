-- Privacy and access hardening.
-- 1. Unfriending or blocking ends every direct share between the two users.
-- 2. Location can only be shared with friends.
-- 3. Meetup invitations only reach friends or members of the meetup's group.
-- 4. The stored position of a stopped or expired location session is deleted.
-- 5. Nothing in `public` can be called without signing in. Before this, an anonymous caller
--    who knew a user id could read that user's busy times through get_shared_busy, because
--    its check `p_owner_id <> auth.uid()` is NULL, not true, when auth.uid() is NULL.

create schema if not exists private;
revoke all on schema private from public;

-- Helpers. They are not exposed through the API and run with the rights of the
-- SECURITY DEFINER function that calls them.
create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  )
$$;

create or replace function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.blocks k
    where (k.blocker_id = a and k.blocked_id = b) or (k.blocker_id = b and k.blocked_id = a)
  )
$$;

-- True when `a` may share with `b`: accepted friends, and neither has blocked the other.
create or replace function private.can_contact(a uuid, b uuid) returns boolean
language sql stable set search_path = '' as $$
  select a <> b and private.are_friends(a, b) and not private.is_blocked_between(a, b)
$$;

-- Ends every direct share between two users, in both directions.
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
$$;

create or replace function private.purge_ended_location_positions() returns void
language sql set search_path = '' as $$
  delete from public.location_positions p
  using public.location_sessions s
  where p.session_id = s.id and (s.stopped_at is not null or s.expires_at <= now());
$$;

create or replace function public.remove_friend(p_other_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  delete from public.friendships
  where status = 'accepted'
    and ((requester_id = auth.uid() and addressee_id = p_other_id)
      or (requester_id = p_other_id and addressee_id = auth.uid()));

  perform private.revoke_relationship_grants(auth.uid(), p_other_id);
end $$;

create or replace function public.block_user(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_user_id = auth.uid() then raise exception 'invalid user'; end if;

  delete from public.friendships
  where (requester_id = auth.uid() and addressee_id = p_user_id)
     or (requester_id = p_user_id and addressee_id = auth.uid());

  insert into public.blocks(blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;

  perform private.revoke_relationship_grants(auth.uid(), p_user_id);
end $$;

-- Same result as before for the owner and for people the owner shares with. A user-level
-- share now also needs the friendship to still exist, and a block always wins.
create or replace function public.get_shared_busy(
  p_owner_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  event_kind text,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end_exclusive date
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_to <= p_from or p_to > p_from + interval '90 days' then raise exception 'invalid range'; end if;

  if p_owner_id <> auth.uid() and (
    private.is_blocked_between(auth.uid(), p_owner_id)
    or not exists(
      select 1 from public.availability_shares s
      where s.owner_id = p_owner_id
        and (
          (s.user_id = auth.uid() and private.are_friends(auth.uid(), p_owner_id))
          or (s.group_id is not null
              and public.is_group_member(s.group_id, auth.uid())
              and public.is_group_member(s.group_id, p_owner_id))
        )
    )
  ) then raise exception 'availability not shared'; end if;

  return query
  select e.event_kind, e.start_at, e.end_at, e.all_day_start, e.all_day_end_exclusive
  from public.calendar_events e
  where e.owner_id = p_owner_id
    and (
      (e.event_kind = 'timed' and e.start_at < p_to and e.end_at > p_from)
      or (e.event_kind = 'all_day' and e.all_day_start < p_to::date and e.all_day_end_exclusive > p_from::date)
    )
  order by coalesce(e.start_at, e.all_day_start::timestamptz);
end $$;

create or replace function public.start_location_session(
  p_duration_minutes integer,
  p_recipient_usernames text[],
  p_approximate boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare sid uuid; recipients uuid[];
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_duration_minutes < 5 or p_duration_minutes > 1440 then raise exception 'invalid duration'; end if;

  select array_agg(p.id) into recipients
  from public.profiles p
  where p.username = any(p_recipient_usernames) and private.can_contact(auth.uid(), p.id);
  if recipients is null then raise exception 'no valid recipients'; end if;

  -- Keeps the table clean even where the scheduled purge below is unavailable.
  perform private.purge_ended_location_positions();

  insert into public.location_sessions(owner_id, expires_at, approximate)
  values (auth.uid(), now() + make_interval(mins => p_duration_minutes), p_approximate)
  returning id into sid;

  insert into public.location_recipients(session_id, user_id)
  select sid, unnest(recipients);

  return sid;
end $$;

create or replace function public.invite_to_meetup(p_meetup_id uuid, p_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; meetup_title text; meetup_group uuid;
begin
  select m.title, m.group_id into meetup_title, meetup_group
  from public.meetups m
  where m.id = p_meetup_id and m.organizer_id = auth.uid();
  if meetup_title is null then raise exception 'organizer required'; end if;

  select p.id into target
  from public.profiles p
  where p.username is not null and lower(p.username) = lower(trim(p_username)) and p.id <> auth.uid()
  limit 1;
  if target is null then raise exception 'user not found'; end if;

  if private.is_blocked_between(auth.uid(), target)
     or not (private.are_friends(auth.uid(), target)
             or (meetup_group is not null and public.is_group_member(meetup_group, target)))
  then raise exception 'invite unavailable'; end if;

  insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
  values (p_meetup_id, target, 'pending')
  on conflict do nothing;

  -- Inviting the same person again does not notify them again.
  if found then
    insert into public.notifications(user_id, category, title, body, action_path)
    values (target, 'meetup_invite', 'Lời mời hoạt động', meetup_title, '/meetups');
  end if;

  return target;
end $$;

-- Shares left behind by earlier unfriends and blocks, and positions of sessions that already ended.
delete from public.availability_shares s
where s.user_id is not null and not private.can_contact(s.owner_id, s.user_id);

select private.purge_ended_location_positions();

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then null; -- the schedule call below reports what is missing
  end;
  perform cron.schedule('purge-ended-location-positions', '*/5 * * * *', 'select private.purge_ended_location_positions()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Positions of ended sessions are then purged only when someone starts a new session.', sqlerrm;
end $$;

-- Signed-in users keep every grant they had. Anonymous and default access is removed.
-- New functions must do the same: revoke from public and anon, grant to authenticated.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_catalog.pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and not exists(select 1 from pg_catalog.pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Only the reminder worker asks whether a push may be sent.
revoke execute on function public.can_send_push(uuid, text) from authenticated;
