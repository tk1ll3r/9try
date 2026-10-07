-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000501','00000000-0000-0000-0000-000000000000','authenticated','authenticated','invite-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000502','00000000-0000-0000-0000-000000000000','authenticated','authenticated','invite-guest@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000501',true);
select lives_ok($$ select public.create_group('Invite test','') $$,'a signed-in user creates a group');
select set_config('test.invite_token',(select token from public.create_group_invite((select id from public.groups where name='Invite test'))),true);
select is(length(current_setting('test.invite_token')),48,'an admin gets an invite token');
select lives_ok($$ select public.schedule_personal_reminder(now()+interval '1 hour','Nhắc','',null) $$,'a reminder can be scheduled');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000502',true);
select lives_ok($$ select public.claim_group_invite(current_setting('test.invite_token')) $$,'another user joins with the token');
reset role;
select is((select member_count from public.groups where name='Invite test'),2,'the group has two members after the invite is used');

select * from finish();
rollback;
