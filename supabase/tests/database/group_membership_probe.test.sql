-- Disposable local Supabase Postgres ONLY. No cloud-linked reset or production use.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000501','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000502','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-member@example.invalid'),
  ('00000000-0000-4000-8000-000000000503','00000000-0000-0000-0000-000000000000','authenticated','authenticated','probe-stranger@example.invalid');
insert into public.groups(id, name, owner_id) values ('00000000-0000-4000-8000-000000000511', 'Probe', '00000000-0000-4000-8000-000000000501');
insert into public.group_memberships(group_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000501', 'owner'),
  ('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000502', 'member')
on conflict do nothing;

select ok(public.is_group_member('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000502'), 'a call without an end user is answered as before');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select ok(public.is_group_member('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000502'), 'a member is told about themselves');
select ok(public.is_group_member('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000501'), 'a member is told about another member');
select ok(public.is_group_admin('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000501'), 'a member is told who the admins are');
select ok(not public.is_group_admin('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000502'), 'a plain member is not an admin');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000503',true);
select ok(not public.is_group_member('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000502'), 'a stranger learns nothing about who is in the group');
select ok(not public.is_group_admin('00000000-0000-4000-8000-000000000511', '00000000-0000-4000-8000-000000000501'), 'a stranger learns nothing about who runs the group');
select is((select count(*) from public.group_memberships where group_id='00000000-0000-4000-8000-000000000511'), 0::bigint, 'row level security still hides the members from a stranger');
reset role;
select * from finish();
rollback;
