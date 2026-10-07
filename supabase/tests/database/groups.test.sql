-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
-- The member-count trigger runs at commit. Each API call is its own transaction, so this test
-- flushes the trigger after every call with "set constraints all immediate".

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000801','00000000-0000-0000-0000-000000000000','authenticated','authenticated','group-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000802','00000000-0000-0000-0000-000000000000','authenticated','authenticated','group-member@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000801',true);
select public.create_group('Role test','');
set constraints all immediate; set constraints all deferred;
select set_config('test.group',(select id::text from public.groups where name='Role test'),true);
select set_config('test.invite',(select token from public.create_group_invite(current_setting('test.group')::uuid)),true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000802',true);
select public.claim_group_invite(current_setting('test.invite'));
set constraints all immediate; set constraints all deferred;
reset role;
select is((select member_count from public.groups where name='Role test'),2,'joining counts the new member once');
select is((select count(*) from realtime.messages where event='groups' and topic='user:00000000-0000-4000-8000-000000000801'),2::bigint,'the owner is told to reload when someone joins');

set local role authenticated;
select throws_ok($$ select public.set_group_member_role(current_setting('test.group')::uuid,'00000000-0000-4000-8000-000000000802','admin') $$,'P0001','owner required','a member cannot change roles');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000801',true);
select lives_ok($$ select public.set_group_member_role(current_setting('test.group')::uuid,'00000000-0000-4000-8000-000000000802','admin') $$,'the owner promotes a member');
select throws_ok($$ select public.set_group_member_role(current_setting('test.group')::uuid,'00000000-0000-4000-8000-000000000801','member') $$,'P0001','member not found','the owner role cannot be changed this way');
select throws_ok($$ select public.set_group_member_role(current_setting('test.group')::uuid,'00000000-0000-4000-8000-000000000802','owner') $$,'P0001','invalid role','ownership is not a role to hand out here');
reset role;
select is((select role::text from public.group_memberships where user_id='00000000-0000-4000-8000-000000000802'),'admin','the member is now an admin');

-- A wrong count repairs itself on the next membership change.
update public.groups set member_count=7 where name='Role test';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000802',true);
select public.leave_group(current_setting('test.group')::uuid);
set constraints all immediate; set constraints all deferred;
reset role;
select is((select member_count from public.groups where name='Role test'),1,'leaving sets the count from the real memberships');
select is((select count(*) from realtime.messages where event='groups' and topic='user:00000000-0000-4000-8000-000000000802') > 0,true,'the person who left is told to reload');

select * from finish();
rollback;
