-- A signed-in person could not read the meetup tables at all.
--
-- Since migration 0001 the policy on `meetups` asks `meetup_invitees` ("is this person invited?")
-- and the policy on `meetup_invitees` asks `meetups` ("is this person the organizer?"). Each read
-- then starts the other policy, and Postgres refuses every such read with "infinite recursion
-- detected in policy". The three tables whose policies look at these two (time options, votes,
-- comments) failed with them. The app lists a person's meetups by reading `meetup_invitees`, so the
-- "Hoạt động" screen could not load on a real database. The functions that change meetups were not
-- affected: they do not go through the policies.
--
-- The two questions are now answered by functions that look the row up directly, as migration 0013
-- did for locations. Who may read what is unchanged.

-- Both answer only about the person who asks.
create function public.is_meetup_organizer(p_meetup_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.meetups m where m.id = p_meetup_id and m.organizer_id = (select auth.uid()))
$$;

create function public.is_meetup_invitee(p_meetup_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.meetup_invitees i where i.meetup_id = p_meetup_id and i.user_id = (select auth.uid()))
$$;

revoke execute on function public.is_meetup_organizer(uuid) from public, anon;
revoke execute on function public.is_meetup_invitee(uuid) from public, anon;
grant execute on function public.is_meetup_organizer(uuid) to authenticated;
grant execute on function public.is_meetup_invitee(uuid) to authenticated;

drop policy meetup_read on public.meetups;
create policy meetup_read on public.meetups for select to authenticated using (
  organizer_id = (select auth.uid())
  or (group_id is not null and public.is_group_member(group_id, (select auth.uid())))
  or public.is_meetup_invitee(id)
);

drop policy invitee_self_read on public.meetup_invitees;
create policy invitee_self_read on public.meetup_invitees for select to authenticated using (
  user_id = (select auth.uid()) or public.is_meetup_organizer(meetup_id)
);
