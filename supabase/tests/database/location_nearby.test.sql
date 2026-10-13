-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000d01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nearby-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000d02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nearby-b@example.invalid');
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000d01','00000000-0000-4000-8000-000000000d02','accepted');

-- A one-way approximate share does not alert until the friend shares back.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d01',true);
select set_config('test.nearby_a_session', public.start_location_session_for(30, array['00000000-0000-4000-8000-000000000d02']::uuid[], true)::text, true);
select lives_ok($$
  insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
  values (current_setting('test.nearby_a_session')::uuid, 10.773, 106.698, 100)
$$, 'a one-way location share can publish before the friend shares back');
select is((select count(*) from public.notifications where category = 'location_nearby'), 0::bigint,
  'a one-way share does not create a nearby notification');

-- The reciprocal approximate share triggers alerts without preference rows.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d02',true);
select set_config('test.nearby_b_session', public.start_location_session_for(30, array['00000000-0000-4000-8000-000000000d01']::uuid[], true)::text, true);
select lives_ok($$
  insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
  values (current_setting('test.nearby_b_session')::uuid, 10.773, 106.698, 100)
$$, 'the reciprocal position is stored and evaluated');
reset role;

select is((select count(*) from public.notifications where category = 'location_nearby'), 2::bigint,
  'both friends receive a nearby notification without opting in');
select is((select count(*) from public.reminders where category = 'location_nearby' and status = 'pending'), 2::bigint,
  'both nearby notifications are queued for push');

-- Disabled legacy settings do not suppress automatic alerts; their radius and repeat values remain optional customizations.
insert into public.location_nearby_preferences(user_id, enabled, radius_m, repeat_minutes)
values
 ('00000000-0000-4000-8000-000000000d01', false, 500, 5),
 ('00000000-0000-4000-8000-000000000d02', false, 500, 10);

-- Another point while both are inside does not create another alert before the repeat interval.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d01',true);
select lives_ok($$
  insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
  values (current_setting('test.nearby_a_session')::uuid, 10.773, 106.698, 100)
  on conflict (session_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m, recorded_at = now()
$$, 'a later position can update while the pair remains nearby');
reset role;
select is((select count(*) from public.notifications where category = 'location_nearby'), 2::bigint,
  'the repeat interval prevents duplicate nearby notifications');

-- Each person can choose a different repeat interval while the pair remains inside.
update public.location_nearby_state
set last_notified_at = now() - interval '6 minutes'
where user_id = '00000000-0000-4000-8000-000000000d01'
  and friend_id = '00000000-0000-4000-8000-000000000d02';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d01',true);
select lives_ok($$
  insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
  values (current_setting('test.nearby_a_session')::uuid, 10.773, 106.698, 100)
  on conflict (session_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m, recorded_at = now()
$$, 'a later nearby update checks the per-person repeat interval');
reset role;
select is((
  select count(*)::text from public.notifications
  where category = 'location_nearby' and user_id = '00000000-0000-4000-8000-000000000d01'
) || ' / ' || (
  select count(*)::text from public.notifications
  where category = 'location_nearby' and user_id = '00000000-0000-4000-8000-000000000d02'
), '2 / 1', 'only the friend whose repeat interval elapsed is reminded');

update public.location_nearby_state set last_notified_at = now() - interval '11 minutes';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d01',true);
insert into public.location_positions(session_id, latitude, longitude, accuracy_m)
values (current_setting('test.nearby_a_session')::uuid, 10.773, 106.698, 100)
on conflict (session_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
  accuracy_m = excluded.accuracy_m, recorded_at = now();
reset role;
select is((select count(*) from public.notifications where category = 'location_nearby'), 5::bigint,
  'both friends are reminded again after their chosen repeat intervals');

select * from finish();
rollback;
