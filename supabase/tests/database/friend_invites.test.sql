-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000701','00000000-0000-0000-0000-000000000000','authenticated','authenticated','link-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000702','00000000-0000-0000-0000-000000000000','authenticated','authenticated','link-guest@example.invalid'),
 ('00000000-0000-4000-8000-000000000703','00000000-0000-0000-0000-000000000000','authenticated','authenticated','link-blocked@example.invalid');
insert into public.blocks(blocker_id, blocked_id)
values ('00000000-0000-4000-8000-000000000701','00000000-0000-4000-8000-000000000703');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000701',true);
select set_config('test.old_token',(select token from public.create_friend_invite()),true);
select set_config('test.token',(select token from public.create_friend_invite()),true);
select is(length(current_setting('test.token')),64,'the owner gets a link token');
select throws_ok($$ select public.claim_friend_invite(current_setting('test.token')) $$,'P0001','own invite','the owner cannot use their own link');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
select throws_ok($$ select public.claim_friend_invite(current_setting('test.old_token')) $$,'P0001','invite not found','a replaced link no longer works');
select lives_ok($$ select public.claim_friend_invite(current_setting('test.token')) $$,'a guest uses the link');
select lives_ok($$ select public.claim_friend_invite(current_setting('test.token')) $$,'using it twice changes nothing');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000703',true);
select throws_ok($$ select public.claim_friend_invite(current_setting('test.token')) $$,'P0001','link unavailable','a blocked person cannot use the link');
reset role;

select is((select count(*) from public.friendships where status='accepted'
  and requester_id='00000000-0000-4000-8000-000000000701' and addressee_id='00000000-0000-4000-8000-000000000702'),1::bigint,'owner and guest are friends once');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000701' and category='friend_request'),1::bigint,'the owner is told once');
select is((select count(*) from realtime.messages where event='friends' and topic in
  ('user:00000000-0000-4000-8000-000000000701','user:00000000-0000-4000-8000-000000000702')),2::bigint,'both friend lists are told to reload');

update public.friend_invites set expires_at=now()-interval '1 minute';
delete from public.friendships;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000702',true);
select throws_ok($$ select public.claim_friend_invite(current_setting('test.token')) $$,'P0001','invite not found','an expired link no longer works');
reset role;

select * from finish();
rollback;
