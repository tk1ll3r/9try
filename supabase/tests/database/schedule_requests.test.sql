-- Disposable local database only; all fixtures roll back.
-- a = a01 owns the schedule, b = a02 and c = a03 are friends of a, d = a04 is a stranger.
-- Days are counted on a's clock (Asia/Ho_Chi_Minh, the default of a profile).
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create function pg_temp.day(n integer) returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + make_interval(days => n)) at time zone 'Asia/Ho_Chi_Minh'
$$;

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000a01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sched-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000a02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sched-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000a03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sched-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000a04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sched-d@example.invalid');
update public.profiles set display_name = 'An' where id = '00000000-0000-4000-8000-000000000a01';
update public.profiles set display_name = 'Bình' where id = '00000000-0000-4000-8000-000000000a02';
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000a01','00000000-0000-4000-8000-000000000a02','accepted'),
  ('00000000-0000-4000-8000-000000000a03','00000000-0000-4000-8000-000000000a01','accepted');

-- A's schedule: a class every week since four weeks ago, 10:00 to 12:00, without next week's;
-- the dentist tomorrow at 15:00; two whole days away from day 20; a payment every month, next in a few days.
insert into public.calendar_events(id, owner_id, title, event_kind, start_at, end_at, timezone, recurrence_rule, recurrence_until, category)
values ('00000000-0000-4000-8000-000000000ae1','00000000-0000-4000-8000-000000000a01','Cấu trúc dữ liệu','timed',
  pg_temp.day(-28) + interval '10 hours', pg_temp.day(-28) + interval '12 hours','Asia/Ho_Chi_Minh','weekly',(pg_temp.day(90) at time zone 'Asia/Ho_Chi_Minh')::date,'class');
insert into public.calendar_event_exceptions(event_id, occurrence_date, canceled)
values ('00000000-0000-4000-8000-000000000ae1',(pg_temp.day(7) at time zone 'Asia/Ho_Chi_Minh')::date,true);
insert into public.calendar_events(owner_id, title, event_kind, start_at, end_at, timezone, private_notes)
values ('00000000-0000-4000-8000-000000000a01','Khám răng','timed',pg_temp.day(1) + interval '15 hours',pg_temp.day(1) + interval '16 hours','Asia/Ho_Chi_Minh','Mang sổ khám');
insert into public.calendar_events(owner_id, title, event_kind, all_day_start, all_day_end_exclusive, timezone)
values ('00000000-0000-4000-8000-000000000a01','Về quê','all_day',(pg_temp.day(20) at time zone 'Asia/Ho_Chi_Minh')::date,(pg_temp.day(22) at time zone 'Asia/Ho_Chi_Minh')::date,'Asia/Ho_Chi_Minh');
insert into public.calendar_events(owner_id, title, event_kind, start_at, end_at, timezone, recurrence_rule)
values ('00000000-0000-4000-8000-000000000a01','Tiền nhà','timed',
  ((pg_temp.day(5) at time zone 'Asia/Ho_Chi_Minh') - interval '2 months' + interval '9 hours') at time zone 'Asia/Ho_Chi_Minh',
  ((pg_temp.day(5) at time zone 'Asia/Ho_Chi_Minh') - interval '2 months' + interval '10 hours') at time zone 'Asia/Ho_Chi_Minh','Asia/Ho_Chi_Minh','monthly');
delete from realtime.messages;

-- Nothing can be read before the owner says yes, and only a friend can ask.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'a friend who never asked reads nothing');
select throws_ok($$select * from public.schedule_grants$$, '42501', null, 'the grants table is closed to clients');
select throws_ok($$select * from public.schedule_requests$$, '42501', null, 'and so is the table of requests');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a04',true);
select throws_ok($$select public.request_schedule('00000000-0000-4000-8000-000000000a01')$$, 'P0001', 'request unavailable', 'a stranger cannot ask');

-- B asks. The owner is told once, and a second question while the first is open is refused.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select lives_ok($$select public.request_schedule('00000000-0000-4000-8000-000000000a01', '  Tuần sau rảnh hôm nào?  ')$$, 'a friend asks');
select throws_ok($$select public.request_schedule('00000000-0000-4000-8000-000000000a01')$$, 'P0001', 'request already sent', 'asking again while the first question is open is refused');
select is((select status || ' ' || direction from public.list_schedule_requests()), 'pending outgoing', 'the one who asked sees the question as open');
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'an open question gives no access');
select throws_ok($$select public.respond_schedule_request((select id from public.list_schedule_requests()), true)$$, 'P0001', 'request not found', 'the one who asked cannot answer for the owner');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
reset role;
select is((select title || ' → ' || action_path from public.notifications where user_id = '00000000-0000-4000-8000-000000000a01' and category = 'schedule_request'),
  'Bình muốn xem lịch của bạn → /calendar/requests', 'the owner is told, with a link to the screen where they answer');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
select is((select count(*) from public.list_schedule_requests()), 0::bigint, 'another friend does not see the question');

-- The owner says yes without choosing anything: busy times, two weeks, no names.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select is((select message from public.list_schedule_requests() where direction = 'incoming'), 'Tuần sau rảnh hôm nào?', 'the owner reads what the friend wrote');
select lives_ok($$select public.respond_schedule_request((select id from public.list_schedule_requests()), true)$$, 'the owner accepts');
select is((select detail || ' ' || (ends_on - starts_on) from public.list_schedule_grants() where direction = 'given'), 'busy 13', 'a plain yes gives busy times for fourteen days');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select is((select count(*) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60))), 3::bigint,
  'the friend sees today''s class, tomorrow''s appointment and this month''s payment: not the skipped class, nor anything after the two weeks');
select is((select count(title) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60))), 0::bigint, 'without any name');
select is((select starts_at from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60)) order by starts_at limit 1), pg_temp.day(0) + interval '10 hours', 'a repeating class is counted out to its time today');
select is((select count(*) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(-30), pg_temp.day(0))), 0::bigint, 'the weeks before the granted days stay closed');
select is((select detail from public.list_schedule_grants() where direction = 'received'), 'busy', 'the friend sees what they were given');
reset role;
select is((select title from public.notifications where user_id = '00000000-0000-4000-8000-000000000a02' and category = 'schedule_response'), 'An đã chia sẻ lịch với bạn', 'the friend is told about the yes');
select isnt((select read_at from public.notifications where user_id = '00000000-0000-4000-8000-000000000a01' and category = 'schedule_request'), null, 'the answered question no longer waits in the owner''s inbox');

-- Names need a new question and a new yes. The days are the owner's choice.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select public.request_schedule('00000000-0000-4000-8000-000000000a01');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select throws_ok($$select public.respond_schedule_request((select id from public.list_schedule_requests() where status = 'pending'), true, 'everything')$$, 'P0001', 'invalid sharing choice', 'a level that does not exist is refused');
select throws_ok($$select public.respond_schedule_request((select id from public.list_schedule_requests() where status = 'pending'), true, 'details', current_date, current_date + 400)$$, 'P0001', 'invalid sharing choice', 'so is more than half a year');
select public.respond_schedule_request((select id from public.list_schedule_requests() where status = 'pending'), true, 'details',
  (pg_temp.day(0) at time zone 'Asia/Ho_Chi_Minh')::date, (pg_temp.day(25) at time zone 'Asia/Ho_Chi_Minh')::date, 30);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select is((select count(*) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60))), 6::bigint,
  'with 26 days: three classes, the appointment, the days away and one payment');
select is((select string_agg(distinct title, ', ' order by title) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60))),
  'Cấu trúc dữ liệu, Khám răng, Tiền nhà, Về quê', 'and now with the names');
select is((select first_day || ' ' || end_day_exclusive from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(60)) where all_day),
  (pg_temp.day(20) at time zone 'Asia/Ho_Chi_Minh')::date || ' ' || (pg_temp.day(22) at time zone 'Asia/Ho_Chi_Minh')::date, 'whole days keep their dates');
select is((select count(*) from public.list_schedule_grants()), 1::bigint, 'the new yes replaced the old one');

-- The owner takes it back: closed at once, and the friend's screen is told.
reset role;
delete from realtime.messages;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select public.revoke_schedule_grant('00000000-0000-4000-8000-000000000a02');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'a revoked permission reads nothing');
reset role;
select is((select count(*) from realtime.messages where event = 'calendar' and topic = 'user:00000000-0000-4000-8000-000000000a02'), 1::bigint, 'and the friend''s calendar is told to reload');

-- A no: the friend is told, and cannot ask again for a week.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select public.request_schedule('00000000-0000-4000-8000-000000000a01');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select public.respond_schedule_request((select id from public.list_schedule_requests() where status = 'pending'), false);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a02',true);
select is((select count(*) from public.list_schedule_requests() where status = 'declined'), 1::bigint, 'the friend sees the no');
select throws_ok($$select public.request_schedule('00000000-0000-4000-8000-000000000a01')$$, 'P0001', 'request too soon', 'and cannot ask again right away');
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'a no gives nothing');

-- C asks and takes the question back: the owner's inbox forgets it.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
select public.request_schedule('00000000-0000-4000-8000-000000000a01');
select public.cancel_schedule_request((select id from public.list_schedule_requests() where status = 'pending'));
reset role;
select is((select count(*) from public.notifications n join public.schedule_requests r on n.dedupe_key = 'schedreq:' || r.id::text where r.requester_id = '00000000-0000-4000-8000-000000000a03'), 0::bigint, 'a withdrawn question leaves the owner''s inbox');

-- C asks again, gets a yes, then the two stop being friends: the permission ends with the friendship.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
select public.request_schedule('00000000-0000-4000-8000-000000000a01');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select public.respond_schedule_request((select id from public.list_schedule_requests() where status = 'pending'), true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
select is((select count(*) from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))), 3::bigint, 'the second friend reads after their yes');
reset role;
update public.schedule_grants set expires_at = now() - interval '1 minute' where viewer_id = '00000000-0000-4000-8000-000000000a03';
set local role authenticated;
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'a permission past its end reads nothing');
reset role;
update public.schedule_grants set expires_at = now() + interval '1 day' where viewer_id = '00000000-0000-4000-8000-000000000a03';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a01',true);
select public.remove_friend('00000000-0000-4000-8000-000000000a03');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000a03',true);
select throws_ok($$select * from public.list_granted_schedule('00000000-0000-4000-8000-000000000a01', pg_temp.day(0), pg_temp.day(30))$$, 'P0001', 'schedule not shared', 'an ex-friend reads nothing');
reset role;
select is((select count(*) from public.schedule_grants), 0::bigint, 'and the permission is gone from the table');
set local role anon;
select throws_ok($$select public.request_schedule('00000000-0000-4000-8000-000000000a01')$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;
