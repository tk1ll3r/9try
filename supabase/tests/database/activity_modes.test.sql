-- Run ONLY on a disposable local DB: npx supabase test db
-- Fixtures and role switches are contained in a transaction; no production identities.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-friend@example.invalid'),
  ('00000000-0000-4000-8000-000000000103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-stranger@example.invalid');
insert into public.friendships(requester_id,addressee_id,status)
values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102','accepted');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select public.set_my_activity_mode('studying', 30);
select is((select count(*) from public.activity_modes), 1::bigint, 'owner sees own mode');
select is((select mode from public.activity_modes limit 1), 'studying', 'owner set allowed mode');
select throws_ok($$select public.set_my_activity_mode('Not a key!',120)$$, 'P0001', 'invalid activity mode or duration', 'reject a key that is not a lower-case word');
select throws_ok($$select public.set_my_activity_mode('x',120)$$, 'P0001', 'invalid activity mode or duration', 'reject a key that is too short');
select lives_ok($$select public.set_my_activity_mode('coffee',30)$$, 'an activity added to the app later needs no migration');
select public.set_my_activity_mode('studying', 30);
select throws_ok($$select public.set_my_activity_mode('gaming',1440)$$, 'P0001', 'invalid activity mode or duration', 'reject invalid duration');
select throws_ok($$insert into public.activity_modes(user_id,mode,expires_at) values('00000000-0000-4000-8000-000000000103','sleeping',now()+interval '1 hour')$$, '42501', 'permission denied for table activity_modes', 'cannot directly write another user mode');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select is((select count(*) from public.activity_modes), 1::bigint, 'accepted friend sees mode');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
select is((select count(*) from public.activity_modes), 0::bigint, 'stranger cannot see mode');

reset role;
update public.activity_modes set expires_at=now()-interval '1 minute', updated_at=now()-interval '1 hour'
where user_id='00000000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select is((select count(*) from public.activity_modes), 0::bigint, 'expired mode invisible');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select public.set_my_activity_mode('sleeping',60);
reset role;
insert into public.blocks(blocker_id,blocked_id)
values ('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000102');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
select is((select count(*) from public.activity_modes), 0::bigint, 'blocker revokes friend visibility');
reset role;
delete from public.blocks where blocker_id='00000000-0000-4000-8000-000000000101';
delete from public.friendships where requester_id='00000000-0000-4000-8000-000000000101';
set local role authenticated;
select is((select count(*) from public.activity_modes), 0::bigint, 'unfriend revokes visibility');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
select public.set_my_activity_mode(null,120);
select is((select count(*) from public.activity_modes), 0::bigint, 'owner can turn mode off');
reset role;
set local role anon;
select is((select has_table_privilege('anon', 'public.activity_modes', 'SELECT')), false, 'anon cannot read activity modes');
reset role;
select * from finish();
rollback;
