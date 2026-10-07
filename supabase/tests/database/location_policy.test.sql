-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','location-owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000202','00000000-0000-0000-0000-000000000000','authenticated','authenticated','location-recipient@example.invalid'),
 ('00000000-0000-4000-8000-000000000203','00000000-0000-0000-0000-000000000000','authenticated','authenticated','location-stranger@example.invalid');
update public.profiles set username='local_location_recipient' where id='00000000-0000-4000-8000-000000000202';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select public.start_location_session(30,array['local_location_recipient'],true);
select is((select count(*) from public.location_sessions),1::bigint,'owner can query active session without RLS recursion');
select lives_ok($$
 insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
 select id,10.7725,106.698,100 from public.location_sessions
 where owner_id='00000000-0000-4000-8000-000000000201'
$$,'owner can publish a position without RLS recursion');
select lives_ok($$
 insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
 select id,10.773,106.699,100 from public.location_sessions
 where owner_id='00000000-0000-4000-8000-000000000201'
 on conflict(session_id) do update set latitude=excluded.latitude, longitude=excluded.longitude, accuracy_m=excluded.accuracy_m
$$,'owner can upsert a position without RLS recursion');
select is((select count(*) from public.location_positions),1::bigint,'owner reads own latest position');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.location_sessions),1::bigint,'recipient can see active session');
select is((select count(*) from public.location_positions),0::bigint,'recipient reads location through projection, not direct positions table');
select is((select count(*) from public.list_visible_locations()),1::bigint,'recipient projection returns one active session');
select is((select count(*) from public.location_sessions where public.is_location_recipient(id)),1::bigint,'definer helper recognizes explicit recipient');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000203',true);
select is((select count(*) from public.location_sessions),0::bigint,'stranger cannot see session');
select is((select count(*) from public.location_positions),0::bigint,'stranger cannot see position');
select is((select count(*) from public.list_visible_locations()),0::bigint,'projection excludes stranger');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select public.stop_location_session((select id from public.location_sessions where owner_id=auth.uid() limit 1));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.location_sessions),0::bigint,'stop revokes recipient session');
reset role;
select is((select count(*) from public.location_positions where session_id in (
  select id from public.location_sessions where owner_id='00000000-0000-4000-8000-000000000201'
)),0::bigint,'stop deletes stored coordinate');
select is((select has_function_privilege('anon','public.is_location_recipient(uuid)','EXECUTE')),false,'anon cannot call recipient helper');
select is((select has_function_privilege('authenticated','public.is_location_recipient(uuid)','EXECUTE')),true,'authenticated policy can call helper');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select public.start_location_session(30,array['local_location_recipient'],true);
select public.block_user('00000000-0000-4000-8000-000000000202');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select is((select count(*) from public.location_sessions),0::bigint,'blocking removes recipient from active session');
select is((select count(*) from public.list_visible_locations()),0::bigint,'blocking revokes location projection');
reset role;
select * from finish();
rollback;
