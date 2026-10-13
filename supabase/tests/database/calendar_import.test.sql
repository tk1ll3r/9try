-- Disposable local database only; all fixtures roll back.
-- a = c01 imports a calendar file, b = c02 is a friend a shares busy times with, c = c03 imports the same file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

create function pg_temp.day(n integer) returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + make_interval(days => n)) at time zone 'Asia/Ho_Chi_Minh'
$$;
create function pg_temp.date(n integer) returns date language sql stable as $$ select (pg_temp.day(n) at time zone 'Asia/Ho_Chi_Minh')::date $$;

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000c01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','import-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000c02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','import-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000c03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','import-c@example.invalid');
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02','accepted');
insert into public.availability_shares(owner_id, user_id)
values ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02');
delete from realtime.messages;

-- What the app's reader makes of a file: the dentist tomorrow; a class every week since four weeks ago,
-- without next week's and with the one after moved to the next day under another name; two whole days away.
create function pg_temp.batch() returns jsonb language sql stable as $$
  select jsonb_build_array(
    jsonb_build_object('uid','dentist','title','Khám răng','place','Phòng khám','kind','timed',
      'start', pg_temp.day(1) + interval '15 hours', 'end', pg_temp.day(1) + interval '16 hours', 'timezone','Asia/Ho_Chi_Minh'),
    jsonb_build_object('uid','class','title','Cấu trúc dữ liệu','place','B1.02','kind','timed',
      'start', pg_temp.day(-28) + interval '10 hours', 'end', pg_temp.day(-28) + interval '12 hours', 'timezone','Asia/Ho_Chi_Minh',
      'rule','weekly','until', pg_temp.date(90), 'category','class',
      'exceptions', jsonb_build_array(
        jsonb_build_object('date', pg_temp.date(7), 'canceled', true),
        jsonb_build_object('date', pg_temp.date(14), 'canceled', false, 'title','Học bù', 'start', pg_temp.day(15) + interval '13 hours', 'end', pg_temp.day(15) + interval '15 hours'),
        jsonb_build_object('date', pg_temp.date(7), 'canceled', false, 'title','Ghi hai lần'))),
    jsonb_build_object('uid','trip','title','Về quê','kind','all_day','start', pg_temp.date(20), 'end', pg_temp.date(21), 'timezone','Asia/Ho_Chi_Minh'))
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
select is(public.import_calendar_events(pg_temp.batch()), '{"added": 3, "already_there": 0}'::jsonb, 'a file of three events is stored in one call');
select is((select count(*) from public.calendar_events), 3::bigint, 'the importer has three events');
select is((select count(*) from public.calendar_events where visibility <> 'only_me'), 0::bigint, 'all of them private');
select is((select string_agg(coalesce(category, 'event') || ':' || coalesce(recurrence_rule, '-') || ':' || coalesce(place, '-'), ', ' order by external_uid) from public.calendar_events),
  'class:weekly:B1.02, event:-:Phòng khám, event:-:-', 'with their kind, repeat and place');
select is((select recurrence_until from public.calendar_events where external_uid = 'class'), pg_temp.date(90), 'the series ends on the day the file says');
select is((select all_day_end_exclusive from public.calendar_events where external_uid = 'trip'), pg_temp.date(22), 'a last day in the file becomes the day after it, as the table keeps it');
select is((select count(*) from public.calendar_event_exceptions), 2::bigint, 'the series has its two dates; a date named twice keeps its first entry');
select is((select canceled from public.calendar_event_exceptions where occurrence_date = pg_temp.date(7)), true, 'next week''s class is skipped');
select is((select override_title || ' ' || (override_start_at = pg_temp.day(15) + interval '13 hours')::text from public.calendar_event_exceptions where occurrence_date = pg_temp.date(14)),
  'Học bù true', 'the class after it is moved, under its other name');
reset role;
select is((select count(*) from public.calendar_events where owner_id = '00000000-0000-4000-8000-000000000c01'), 3::bigint, 'the events belong to whoever called');
select is((select count(*) from realtime.messages where topic = 'user:00000000-0000-4000-8000-000000000c01' and event = 'calendar'), 1::bigint, 'the importer''s other screens are told once');

-- The same file again adds nothing, and what was changed in the app since stays.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
update public.calendar_events set title = 'Khám răng (dời)' where external_uid = 'dentist';
select is(public.import_calendar_events(pg_temp.batch()), '{"added": 0, "already_there": 3}'::jsonb, 'importing the file again adds nothing');
select is((select title from public.calendar_events where external_uid = 'dentist'), 'Khám răng (dời)', 'and does not undo a change made in the app');
select is(public.import_calendar_events(pg_temp.batch() || jsonb_build_array(jsonb_build_object('uid','new','title','Mới','kind','timed','start', pg_temp.day(2), 'end', pg_temp.day(2) + interval '1 hour', 'timezone','Asia/Ho_Chi_Minh'))),
  '{"added": 1, "already_there": 3}'::jsonb, 'a file that grew adds what is new');
select is(public.import_calendar_events('[]'::jsonb), '{"added": 0, "already_there": 0}'::jsonb, 'an empty file is no error');

-- What the table would refuse is refused as a whole, and the entry is named.
select throws_ok($$select public.import_calendar_events(jsonb_build_array(
  jsonb_build_object('uid','fine','title','Được','kind','timed','start', now(), 'end', now() + interval '1 hour', 'timezone','Asia/Ho_Chi_Minh'),
  jsonb_build_object('uid','backwards','title','Ngược','kind','timed','start', now(), 'end', now() - interval '1 hour', 'timezone','Asia/Ho_Chi_Minh')))$$,
  'P0001', 'invalid import entry 2', 'an event that ends before it starts is named by its place in the file');
select is((select count(*) from public.calendar_events where external_uid = 'fine'), 0::bigint, 'and nothing of that file is kept');
select throws_ok($$select public.import_calendar_events(jsonb_build_array(jsonb_build_object('uid','nowhere','title','Đâu','kind','timed','start', now(), 'end', now() + interval '1 hour', 'timezone','Mars/Olympus', 'rule','weekly','until', pg_temp.date(30))))$$,
  'P0001', 'invalid import entry 1', 'a zone that does not exist is refused');
select throws_ok($$select public.import_calendar_events(jsonb_build_array(jsonb_build_object('title','Không mã','kind','timed','start', now(), 'end', now() + interval '1 hour', 'timezone','UTC')))$$,
  'P0001', 'invalid import entry 1', 'an entry without the id of its source is refused');
select throws_ok($$select public.import_calendar_events('{"uid": "one"}'::jsonb)$$, 'P0001', 'invalid import', 'what is not a list is refused');
select throws_ok($$select public.import_calendar_events((select jsonb_agg(jsonb_build_object('uid','n' || n,'title','t','kind','timed','start', now(), 'end', now() + interval '1 hour', 'timezone','UTC')) from generate_series(1, 1001) n))$$,
  'P0001', 'too many events', 'more than a thousand events in one call are refused');
select is((select count(*) from public.calendar_events), 4::bigint, 'after the refusals the importer has what they had');

-- Someone else who imports the same file gets events of their own.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c03',true);
select is(public.import_calendar_events(pg_temp.batch()), '{"added": 3, "already_there": 0}'::jsonb, 'the same file imported by another person is theirs');
select is((select count(*) from public.calendar_events), 3::bigint, 'and they see their own three, not the first person''s');

-- An imported class is busy time for a friend the importer shares busy times with, repeat and skipped dates included.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c02',true);
select is((select recurrence_rule || ' ' || jsonb_array_length(exceptions) from public.list_shared_busy('00000000-0000-4000-8000-000000000c01', pg_temp.day(0), pg_temp.day(30)) where recurrence_rule is not null),
  'weekly 2', 'a friend who is shown busy times sees the imported class as a weekly busy time with its two dates');
select is((select count(*) from public.calendar_events), 0::bigint, 'and reads none of the events themselves');
reset role;

set local role anon;
select throws_ok($$select public.import_calendar_events('[]'::jsonb)$$, '42501', null, 'an anonymous visitor cannot import');
reset role;
select * from finish();
rollback;
