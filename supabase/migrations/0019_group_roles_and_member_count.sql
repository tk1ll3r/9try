-- member_count now follows the memberships table. It was adjusted by hand in three functions
-- and missed when an account was deleted. The trigger runs at the end of the transaction, so
-- the hand adjustments in the older functions no longer matter. Members are told to reload.
create or replace function private.sync_group_members() returns trigger
language plpgsql security definer set search_path = '' as $$
declare gid uuid := coalesce(new.group_id, old.group_id);
begin
  update public.groups g
  set member_count = greatest(1, (select count(*) from public.group_memberships m where m.group_id = gid))
  where g.id = gid;

  perform private.emit(m.user_id, 'groups') from public.group_memberships m where m.group_id = gid;
  if tg_op = 'DELETE' then perform private.emit(old.user_id, 'groups'); end if;
  return null;
end $$;

drop trigger if exists group_memberships_sync on public.group_memberships;
create constraint trigger group_memberships_sync
after insert or update or delete on public.group_memberships
deferrable initially deferred
for each row execute function private.sync_group_members();

update public.groups g
set member_count = greatest(1, (select count(*) from public.group_memberships m where m.group_id = g.id));

-- The owner makes a member an admin, or an admin a member again.
create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('admin', 'member') then raise exception 'invalid role'; end if;
  if not exists(select 1 from public.groups g where g.id = p_group_id and g.owner_id = auth.uid()) then
    raise exception 'owner required';
  end if;

  update public.group_memberships m
  set role = p_role::public.group_role
  where m.group_id = p_group_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then raise exception 'member not found'; end if;
end $$;

revoke execute on function public.set_group_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_group_member_role(uuid, uuid, text) to authenticated;
