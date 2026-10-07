-- 1. A meetup created for a group invites every member of that group. Before this, members
--    who were not invited one by one never saw the group's meetups.
-- 2. The organizer invites people picked from a list (user ids) instead of typed usernames.
-- 3. Invited people can see who else is invited and what they answered.

create or replace function public.create_meetup(
  p_group_id uuid,
  p_title text,
  p_description text,
  p_timezone text,
  p_capacity integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id, auth.uid()) then raise exception 'group membership required'; end if;
  if p_capacity is not null and p_capacity < 1 then raise exception 'invalid capacity'; end if;

  insert into public.meetups(group_id, organizer_id, title, description, status, timezone, capacity)
  values (p_group_id, auth.uid(), trim(p_title), coalesce(p_description, ''), 'proposed', p_timezone, p_capacity)
  returning id into mid;

  insert into public.meetup_invitees(meetup_id, user_id, rsvp_status, responded_at)
  values (mid, auth.uid(), 'going', now());

  if p_group_id is not null then
    insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
    select mid, m.user_id, 'pending'
    from public.group_memberships m
    where m.group_id = p_group_id and m.user_id <> auth.uid()
      and not private.is_blocked_between(auth.uid(), m.user_id);

    insert into public.notifications(user_id, category, title, body, action_path)
    select i.user_id, 'meetup_invite', 'Lời mời hoạt động', trim(p_title), '/meetups'
    from public.meetup_invitees i
    where i.meetup_id = mid and i.user_id <> auth.uid();
  end if;

  return mid;
end $$;

-- Returns how many people were newly invited. People the organizer may not invite are skipped.
create or replace function public.invite_users_to_meetup(p_meetup_id uuid, p_user_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare meetup_title text; meetup_group uuid; invited integer;
begin
  select m.title, m.group_id into meetup_title, meetup_group
  from public.meetups m
  where m.id = p_meetup_id and m.organizer_id = auth.uid() and m.status not in ('canceled', 'completed');
  if meetup_title is null then raise exception 'organizer required'; end if;

  with added as (
    insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
    select p_meetup_id, p.id, 'pending'
    from public.profiles p
    where p.id = any(p_user_ids) and p.id <> auth.uid()
      and not private.is_blocked_between(auth.uid(), p.id)
      and (private.are_friends(auth.uid(), p.id)
        or (meetup_group is not null and public.is_group_member(meetup_group, p.id)))
    on conflict do nothing
    returning user_id
  ), told as (
    insert into public.notifications(user_id, category, title, body, action_path)
    select a.user_id, 'meetup_invite', 'Lời mời hoạt động', meetup_title, '/meetups' from added a
    returning 1
  )
  select count(*) into invited from told;
  return invited;
end $$;

create or replace function public.list_meetup_participants(p_meetup_id uuid)
returns table(user_id uuid, display_name text, username text, rsvp_status public.rsvp_status)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username, i.rsvp_status
  from public.meetup_invitees i
  join public.profiles p on p.id = i.user_id
  where i.meetup_id = p_meetup_id
    and exists(
      select 1 from public.meetups m
      where m.id = p_meetup_id
        and (m.organizer_id = auth.uid()
          or exists(select 1 from public.meetup_invitees mine where mine.meetup_id = m.id and mine.user_id = auth.uid()))
    )
  order by case i.rsvp_status when 'going' then 1 when 'maybe' then 2 when 'pending' then 3 else 4 end, p.display_name
$$;

revoke execute on function public.invite_users_to_meetup(uuid, uuid[]) from public, anon;
revoke execute on function public.list_meetup_participants(uuid) from public, anon;
grant execute on function public.invite_users_to_meetup(uuid, uuid[]) to authenticated;
grant execute on function public.list_meetup_participants(uuid) to authenticated;
