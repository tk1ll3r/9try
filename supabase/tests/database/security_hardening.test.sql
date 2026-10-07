-- Disposable local database only; all fixtures roll back.
-- a = 301, b = 302 (friend of a), c = 303 (stranger), d = 304 (in a's group, not a friend).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hard-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hard-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000303','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hard-c@example.invalid'),
 ('00000000-0000-4000-8000-000000000304','00000000-0000-0000-0000-000000000000','authenticated','authenticated','hard-d@example.invalid');
update public.profiles set username='hard_b' where id='00000000-0000-4000-8000-000000000302';
update public.profiles set username='hard_c' where id='00000000-0000-4000-8000-000000000303';
update public.profiles set username='hard_d' where id='00000000-0000-4000-8000-000000000304';
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302','accepted');
insert into public.groups(id, owner_id, name, member_count)
values ('00000000-0000-4000-8000-0000000003a1','00000000-0000-4000-8000-000000000301','Hard group',2);
insert into public.group_memberships(group_id, user_id, role)
values ('00000000-0000-4000-8000-0000000003a1','00000000-0000-4000-8000-000000000301','owner'),
       ('00000000-0000-4000-8000-0000000003a1','00000000-0000-4000-8000-000000000304','member');
insert into public.meetups(id, group_id, organizer_id, title, status, timezone)
values ('00000000-0000-4000-8000-0000000003b1','00000000-0000-4000-8000-0000000003a1','00000000-0000-4000-8000-000000000301','Hard meetup','proposed','UTC');
insert into public.calendar_events(id, owner_id, title, event_kind, start_at, end_at, timezone, visibility)
values ('00000000-0000-4000-8000-0000000003c1','00000000-0000-4000-8000-000000000301','Busy','timed',now()+interval '1 hour',now()+interval '2 hours','UTC','selected_friends');
insert into public.event_shares(event_id, user_id)
values ('00000000-0000-4000-8000-0000000003c1','00000000-0000-4000-8000-000000000302');
insert into public.availability_shares(owner_id, user_id)
values ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302'),
       ('00000000-0000-4000-8000-000000000302','00000000-0000-4000-8000-000000000301');

-- Sharing and inviting reach only people the user is connected to.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select throws_ok($$ select public.start_location_session(30,array['hard_c'],false) $$,'P0001','no valid recipients','location cannot be shared with a stranger');
select lives_ok($$ select public.start_location_session(30,array['hard_b','hard_c'],false) $$,'location can be shared with a friend');
select throws_ok($$ select public.invite_to_meetup('00000000-0000-4000-8000-0000000003b1','hard_c') $$,'P0001','invite unavailable','a stranger cannot be invited to a meetup');
select lives_ok($$ select public.invite_to_meetup('00000000-0000-4000-8000-0000000003b1','hard_d') $$,'a member of the meetup group can be invited');
select lives_ok($$ select public.invite_to_meetup('00000000-0000-4000-8000-0000000003b1','hard_b') $$,'a friend can be invited');
select lives_ok($$ select public.invite_to_meetup('00000000-0000-4000-8000-0000000003b1','hard_b') $$,'inviting the same person twice is allowed');
reset role;
select is((select count(*) from public.location_recipients r join public.location_sessions s on s.id=r.session_id
  where s.owner_id='00000000-0000-4000-8000-000000000301'),1::bigint,'only the friend became a location recipient');
select is((select count(*) from public.notifications
  where user_id='00000000-0000-4000-8000-000000000302' and category='meetup_invite'),1::bigint,'a repeated invitation notifies once');

-- Unfriending ends every direct share.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
select lives_ok($$ select * from public.get_shared_busy('00000000-0000-4000-8000-000000000301',now(),now()+interval '1 day') $$,'a friend with a share reads busy times');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select public.remove_friend('00000000-0000-4000-8000-000000000302');
reset role;
select is((select count(*) from public.availability_shares
  where owner_id in ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302')),0::bigint,'unfriending removes availability shares in both directions');
select is((select count(*) from public.location_recipients where user_id='00000000-0000-4000-8000-000000000302'),0::bigint,'unfriending removes the location recipient');
select is((select count(*) from public.event_shares where user_id='00000000-0000-4000-8000-000000000302'),0::bigint,'unfriending removes event shares');

-- A share row that outlives the friendship grants nothing.
insert into public.availability_shares(owner_id, user_id)
values ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
select throws_ok($$ select * from public.get_shared_busy('00000000-0000-4000-8000-000000000301',now(),now()+interval '1 day') $$,'P0001','availability not shared','a stale share does not expose busy times');
reset role;

-- Blocking ends every direct share.
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302','accepted');
insert into public.event_shares(event_id, user_id)
values ('00000000-0000-4000-8000-0000000003c1','00000000-0000-4000-8000-000000000302');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select public.start_location_session(30,array['hard_b'],false);
select public.block_user('00000000-0000-4000-8000-000000000302');
reset role;
select is((select count(*) from public.availability_shares
  where owner_id='00000000-0000-4000-8000-000000000302' or user_id='00000000-0000-4000-8000-000000000302'),0::bigint,'blocking removes availability shares');
select is((select count(*) from public.location_recipients where user_id='00000000-0000-4000-8000-000000000302'),0::bigint,'blocking removes the location recipient');
select is((select count(*) from public.event_shares where user_id='00000000-0000-4000-8000-000000000302'),0::bigint,'blocking removes event shares');

-- Ended sessions keep no position.
insert into public.location_sessions(id, owner_id, created_at, expires_at)
values ('00000000-0000-4000-8000-0000000003d1','00000000-0000-4000-8000-000000000301',now()-interval '2 hours',now()-interval '1 hour');
insert into public.location_positions(session_id, latitude, longitude)
values ('00000000-0000-4000-8000-0000000003d1',10.77,106.69);
select private.purge_ended_location_positions();
select is((select count(*) from public.location_positions where session_id='00000000-0000-4000-8000-0000000003d1'),0::bigint,'the position of an expired session is purged');
select is((select count(*) from cron.job where jobname='purge-ended-location-positions'),1::bigint,'the purge runs on a schedule');

-- Access.
select is((select count(*) from pg_catalog.pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f'
    and not exists(select 1 from pg_catalog.pg_depend d where d.objid=p.oid and d.deptype='e')
    and has_function_privilege('anon',p.oid,'EXECUTE')),0::bigint,'anonymous visitors cannot call any public function');
select is(has_function_privilege('authenticated','public.get_shared_busy(uuid,timestamptz,timestamptz)','EXECUTE'),true,'signed-in users keep their grants');
select is(has_function_privilege('authenticated','public.can_send_push(uuid,text)','EXECUTE'),false,'only the reminder worker may ask about push');
select is(has_schema_privilege('authenticated','private','USAGE'),false,'helper functions are not reachable through the API');

select * from finish();
rollback;
