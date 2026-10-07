-- is_group_member and is_group_admin answered for any group and any user, so a signed-in user who
-- knew two ids could learn that someone belongs to a group. They now answer only about the caller,
-- or to a caller who is in that group. Calls without an end user (scheduled jobs, the service role)
-- are answered as before. Policies always ask about auth.uid(), so they behave the same.
create or replace function public.is_group_member(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.group_memberships m where m.group_id = g and m.user_id = u)
     and ((select auth.uid()) is null or u = (select auth.uid())
          or exists(select 1 from public.group_memberships m where m.group_id = g and m.user_id = (select auth.uid())));
$$;

create or replace function public.is_group_admin(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.group_memberships m where m.group_id = g and m.user_id = u and m.role in ('owner', 'admin'))
     and ((select auth.uid()) is null or u = (select auth.uid())
          or exists(select 1 from public.group_memberships m where m.group_id = g and m.user_id = (select auth.uid())));
$$;
