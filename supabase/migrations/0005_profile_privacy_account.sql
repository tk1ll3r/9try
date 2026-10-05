-- Profile privacy, safe group-member projection, and account deletion preparation.

drop policy if exists profiles_read on public.profiles;
create policy profiles_self_read on public.profiles
for select to authenticated
using(id=auth.uid());

create or replace function public.list_group_members(p_group_id uuid)
returns table(
  user_id uuid,
  display_name text,
  username text,
  avatar_url text,
  role public.group_role,
  joined_at timestamptz
)
language sql stable security definer set search_path=public as $$
  select p.id,p.display_name,p.username,p.avatar_url,gm.role,gm.joined_at
  from public.group_memberships gm
  join public.profiles p on p.id=gm.user_id
  where gm.group_id=p_group_id
    and public.is_group_member(p_group_id,auth.uid())
  order by
    case gm.role when 'owner' then 1 when 'admin' then 2 else 3 end,
    gm.joined_at
$$;

create or replace function public.list_blocked_users()
returns table(user_id uuid,display_name text,username text,avatar_url text,blocked_at timestamptz)
language sql stable security definer set search_path=public as $$
  select p.id,p.display_name,p.username,p.avatar_url,b.created_at
  from public.blocks b
  join public.profiles p on p.id=b.blocked_id
  where b.blocker_id=auth.uid()
  order by b.created_at desc
$$;

create or replace function public.prepare_account_deletion() returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if exists(
    select 1 from public.groups
    where owner_id=auth.uid() and member_count>1
  ) then
    raise exception 'transfer ownership of groups with other members first';
  end if;

  delete from public.groups where owner_id=auth.uid();
  delete from public.group_invites where created_by=auth.uid();
  delete from public.meetup_comments where author_id=auth.uid();
  delete from public.meetups where organizer_id=auth.uid();
  delete from public.group_memberships where user_id=auth.uid();
end $$;

grant execute on function public.list_group_members(uuid) to authenticated;
grant execute on function public.list_blocked_users() to authenticated;
grant execute on function public.prepare_account_deletion() to authenticated;
