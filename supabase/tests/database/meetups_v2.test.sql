-- Disposable local database only; all fixtures roll back.
-- a = c01 organizes, b = c02 is a friend, c = c03 is a stranger, d = c04 is in a's group.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000c01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000c02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000c03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-c@example.invalid'),
 ('00000000-0000-4000-8000-000000000c04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-d@example.invalid');
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02','accepted');
insert into public.groups(id, owner_id, name, member_count)
values ('00000000-0000-4000-8000-000000000ca1','00000000-0000-4000-8000-000000000c01','Meet group',2);
insert into public.group_memberships(group_id, user_id, role)
values ('00000000-0000-4000-8000-000000000ca1','00000000-0000-4000-8000-000000000c01','owner'),
       ('00000000-0000-4000-8000-000000000ca1','00000000-0000-4000-8000-000000000c04','member');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
select set_config('test.meetup',public.create_meetup('00000000-0000-4000-8000-000000000ca1','Học nhóm','','Asia/Ho_Chi_Minh',null)::text,true);
select is((select count(*) from public.list_meetup_participants(current_setting('test.meetup')::uuid)),2::bigint,'a group meetup invites the other group member');
select is(public.invite_users_to_meetup(current_setting('test.meetup')::uuid,array['00000000-0000-4000-8000-000000000c02','00000000-0000-4000-8000-000000000c03']::uuid[]),1,'a friend is invited and a stranger is skipped');
select is(public.invite_users_to_meetup(current_setting('test.meetup')::uuid,array['00000000-0000-4000-8000-000000000c02']::uuid[]),0,'inviting again adds nobody');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c04',true);
select is((select count(*) from public.list_meetup_participants(current_setting('test.meetup')::uuid)),3::bigint,'an invited person sees who else is invited');
select throws_ok($$ select public.invite_users_to_meetup(current_setting('test.meetup')::uuid,array['00000000-0000-4000-8000-000000000c03']::uuid[]) $$,'P0001','organizer required','only the organizer invites');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c03',true);
select is((select count(*) from public.list_meetup_participants(current_setting('test.meetup')::uuid)),0::bigint,'someone who is not invited sees nobody');
reset role;

select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000c04' and category='meetup_invite'),1::bigint,'the group member is notified once');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000c02' and category='meetup_invite'),1::bigint,'the friend is notified once');

select * from finish();
rollback;
