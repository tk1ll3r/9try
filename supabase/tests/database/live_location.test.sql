-- Disposable local database only; all fixtures roll back.
-- a = a01 shares, b = a02 is a friend, c = a03 is a stranger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000a01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','live-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000a02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','live-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000a03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','live-c@example.invalid');
update public.profiles set display_name='An' where id='00000000-0000-4000-8000-000000000a01';
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000a01','00000000-0000-4000-8000-000000000a02','accepted');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select throws_ok($$ select public.start_location_session_for(30,array['00000000-0000-4000-8000-000000000a03']::uuid[],false) $$,'P0001','no valid recipients','sharing by id is refused for a stranger');
select set_config('test.session',public.start_location_session_for(30,array['00000000-0000-4000-8000-000000000a02','00000000-0000-4000-8000-000000000a03']::uuid[],false)::text,true);
reset role;
select is((select count(*) from public.location_recipients where session_id=current_setting('test.session')::uuid),1::bigint,'only the friend becomes a recipient');

delete from realtime.messages;
set local role authenticated;
insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
values (current_setting('test.session')::uuid,10.77,106.69,12);
reset role;
select is((select count(*) from realtime.messages where event='location' and topic='user:00000000-0000-4000-8000-000000000a02'),1::bigint,'a new position is announced to the recipient');
select is((select count(*) from realtime.messages where event='location' and topic='user:00000000-0000-4000-8000-000000000a01'),1::bigint,'and to the sharer');
select is((select count(*) from realtime.messages where topic='user:00000000-0000-4000-8000-000000000a03'),0::bigint,'but not to anyone else');

delete from realtime.messages;
set local role authenticated;
select public.stop_location_session(current_setting('test.session')::uuid);
reset role;
select is((select count(*) from realtime.messages where event='location' and topic='user:00000000-0000-4000-8000-000000000a02') > 0,true,'stopping is announced to the recipient');

-- Unfriending removes the recipient and tells their map.
set local role authenticated;
select set_config('test.session2',public.start_location_session_for(30,array['00000000-0000-4000-8000-000000000a02']::uuid[],true)::text,true);
reset role;
delete from realtime.messages;
set local role authenticated;
select public.remove_friend('00000000-0000-4000-8000-000000000a02');
reset role;
select is((select count(*) from realtime.messages where event='location' and topic='user:00000000-0000-4000-8000-000000000a02') > 0,true,'a removed recipient is told to reload');

-- Asking for a location is only a notification, and only between friends.
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000a02','00000000-0000-4000-8000-000000000a01','accepted');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select lives_ok($$ select public.request_location('00000000-0000-4000-8000-000000000a02') $$,'a friend can be asked');
select lives_ok($$ select public.request_location('00000000-0000-4000-8000-000000000a02') $$,'asking again right away is accepted');
select throws_ok($$ select public.request_location('00000000-0000-4000-8000-000000000a03') $$,'P0001','request unavailable','a stranger cannot be asked');
reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000a02' and category='location_request'),1::bigint,'two requests in ten minutes notify once');

select * from finish();
rollback;
