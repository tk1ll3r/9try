-- Disposable local database only; all fixtures roll back.
-- a = c01, b = c02 and c = c03 are friends of a. B has push on and one device.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000c01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000c02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000c03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','push-c@example.invalid');
update public.profiles set display_name = 'An' where id = '00000000-0000-4000-8000-000000000c01';
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000c01','00000000-0000-4000-8000-000000000c02','accepted'),
  ('00000000-0000-4000-8000-000000000c03','00000000-0000-4000-8000-000000000c01','accepted');
insert into public.notification_preferences(user_id, push_enabled, category_push, private_previews)
values ('00000000-0000-4000-8000-000000000c02', true, '{"friend_mode": true}', true);
insert into public.push_subscriptions(id, user_id, endpoint, p256dh, auth, language)
values ('00000000-0000-4000-8000-000000000cd1','00000000-0000-4000-8000-000000000c02','https://push.example/b-phone','key','auth','en');
insert into public.friend_pins(user_id, friend_id) values
  ('00000000-0000-4000-8000-000000000c02','00000000-0000-4000-8000-000000000c01'),
  ('00000000-0000-4000-8000-000000000c03','00000000-0000-4000-8000-000000000c01');

-- 1. The queue. A notification is claimed with what to say and the devices to say it to.
insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
values ('00000000-0000-4000-8000-000000000c02','chat_message','Tin nhắn mới · An','','/chat/x','k1');
set local role authenticated;
select throws_ok($$select public.claim_push_batch()$$, '42501', null, 'a signed-in user cannot take the queue');
select throws_ok($$select public.finish_push(null, '[]')$$, '42501', null, 'nor report results');
reset role;
set local role service_role;
create temp table batch as select public.claim_push_batch() as items;
reset role;
select is((select jsonb_array_length(items) from batch), 1, 'the worker gets the one entry that is due');
select is((select items->0->>'title' || ' → ' || (items->0->>'url') || ' #' || (items->0->>'tag') from batch), 'Tin nhắn mới · An → /chat/x #k1', 'with its text, its link and its key');
select is((select items->0->'devices'->0->>'language' || ' ' || (items->0->>'private') from batch), 'en true', 'the device''s language and the person''s wish for a private preview come along');
select is((select status || ' ' || attempts from public.reminders where idempotency_key = 'k1'), 'processing 1', 'the entry is marked as being worked on');

-- A device that answers with an error is noted, and the entry waits two minutes for another try.
select public.finish_push((select id from public.reminders where idempotency_key = 'k1'), '[{"device":"00000000-0000-4000-8000-000000000cd1","status":500,"error":"push service unavailable"}]');
select is((select status || ' ' || last_error from public.reminders where idempotency_key = 'k1'), 'pending push service unavailable', 'a refusal puts the entry back, with the reason');
select is((select due_at from public.reminders where idempotency_key = 'k1'), now() + interval '2 minutes', 'for two minutes');
select is((select failure_count || ' ' || last_error from public.push_subscriptions where id = '00000000-0000-4000-8000-000000000cd1'), '1 push service unavailable', 'and the device keeps what it answered');
select is((select jsonb_array_length(public.claim_push_batch())), 0, 'an entry that waits is not taken');

-- After five tries it is given up.
update public.reminders set due_at = now(), attempts = 4 where idempotency_key = 'k1';
select public.claim_push_batch();
select public.finish_push((select id from public.reminders where idempotency_key = 'k1'), '[{"device":"00000000-0000-4000-8000-000000000cd1","status":503}]');
select is((select status || ' ' || attempts || ' ' || last_error from public.reminders where idempotency_key = 'k1'), 'failed 5 503', 'the fifth refusal ends it');

-- A success clears the device's record. An address the browser gave up is removed.
insert into public.notifications(user_id, category, title, dedupe_key) values ('00000000-0000-4000-8000-000000000c02','friend_request','Lời mời kết bạn','k2');
select public.claim_push_batch();
select public.finish_push((select id from public.reminders where idempotency_key = 'k2'), '[{"device":"00000000-0000-4000-8000-000000000cd1","status":201}]');
select is((select status from public.reminders where idempotency_key = 'k2'), 'delivered', 'an entry a device took is done');
select is((select failure_count::text || ' ' || coalesce(last_error, 'none') || ' ' || (last_success_at is not null) from public.push_subscriptions where id = '00000000-0000-4000-8000-000000000cd1'), '0 none true', 'and the device is healthy again');
insert into public.notifications(user_id, category, title, dedupe_key) values ('00000000-0000-4000-8000-000000000c02','friend_request','Lời mời kết bạn','k3');
select public.claim_push_batch();
select public.finish_push((select id from public.reminders where idempotency_key = 'k3'), '[{"device":"00000000-0000-4000-8000-000000000cd1","status":410}]');
select is((select count(*) from public.push_subscriptions where user_id = '00000000-0000-4000-8000-000000000c02'), 0::bigint, 'an address the browser gave up is removed');
select is((select status from public.reminders where idempotency_key = 'k3'), 'delivered', 'and with nobody left to send to, the entry is closed');

-- Who is not pushed to: no push for a notification that was read, a kind that is off, or in the quiet hours.
insert into public.push_subscriptions(id, user_id, endpoint, p256dh, auth) values ('00000000-0000-4000-8000-000000000cd2','00000000-0000-4000-8000-000000000c02','https://push.example/b-laptop','key','auth');
insert into public.notifications(user_id, category, title, dedupe_key, read_at) values ('00000000-0000-4000-8000-000000000c02','friend_request','Lời mời kết bạn','k4', now());
select is((select jsonb_array_length(public.claim_push_batch()->0->'devices')), 0, 'a notification that was read in the app is not pushed');
update public.notification_preferences set category_push = '{"chat_message": false}' where user_id = '00000000-0000-4000-8000-000000000c02';
insert into public.notifications(user_id, category, title, dedupe_key) values ('00000000-0000-4000-8000-000000000c02','chat_message','Tin nhắn mới · An','k5');
select is((select jsonb_array_length(public.claim_push_batch()->0->'devices')), 0, 'a kind the person turned off is not pushed');
update public.notification_preferences set category_push = '{}',
  quiet_start = ((now() at time zone 'Asia/Ho_Chi_Minh') - interval '1 hour')::time, quiet_end = ((now() at time zone 'Asia/Ho_Chi_Minh') + interval '1 hour')::time
where user_id = '00000000-0000-4000-8000-000000000c02';
insert into public.notifications(user_id, category, title, dedupe_key) values ('00000000-0000-4000-8000-000000000c02','friend_request','Lời mời kết bạn','k6');
select is((select jsonb_array_length(public.claim_push_batch()->0->'devices')), 0, 'nothing is pushed in the quiet hours');
update public.notification_preferences set quiet_start = null, quiet_end = null where user_id = '00000000-0000-4000-8000-000000000c02';

-- A worker that died leaves its entries; ten minutes later they are taken again.
update public.reminders set processing_started_at = now() - interval '11 minutes' where idempotency_key = 'k6';
select is((select public.claim_push_batch()->0->>'tag'), 'k6', 'an entry left behind by a dead worker is taken again');
select is((select count(*) from cron.job where jobname = 'push-worker' and schedule = '*/5 * * * *'), 1::bigint, 'the database calls the worker every five minutes');
select is((select count(*) from cron.job where jobname = 'deliver-due-reminders' and schedule = '* * * * *'), 1::bigint, 'reminders are still delivered every minute');

-- 2. A pinned friend turns a mode on: only for someone who asked for these alerts.
update public.notification_preferences set category_push = '{"friend_mode": true}' where user_id = '00000000-0000-4000-8000-000000000c02';
delete from public.notifications; delete from public.reminders;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
select public.set_my_activity_mode('studying', 60);
reset role;
select is((select title || ' | ' || body || ' | ' || action_path from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02'), 'An vừa bật mode | mode:studying | /', 'the one who asked is told, with the key of the activity');
select is((select due_at from public.reminders where user_id = '00000000-0000-4000-8000-000000000c02'), now() + interval '1 minute', 'and the push waits a minute for the mode to settle');
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c03'), 0::bigint, 'a friend who pinned them but did not ask hears nothing');
set local role authenticated;
select public.set_my_activity_mode('coffee', 60);
select public.set_my_activity_mode('coffee', 120);
reset role;
select is((select count(*)::text || ' ' || max(body) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02'), '1 mode:coffee', 'changes in a row are one alert, about the last mode');
select is((select count(*) from public.reminders where user_id = '00000000-0000-4000-8000-000000000c02' and status = 'pending'), 1::bigint, 'and one push');
set local role authenticated;
select public.set_my_activity_mode(null, 60);
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02'), 0::bigint, 'a mode turned off before the alert went out leaves nothing to tell');
select is((select status from public.reminders where user_id = '00000000-0000-4000-8000-000000000c02'), 'canceled', 'and nothing to push');

-- 3. Meetups: the notification opens the meetup, and everyone who comes is reminded half an hour before.
delete from public.notifications; delete from public.reminders;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
create temp table made as select public.create_meetup(null, 'Ăn tối', '', 'Asia/Ho_Chi_Minh') as id;
select public.invite_users_to_meetup((select id from made), array['00000000-0000-4000-8000-000000000c02']::uuid[]);
select public.create_meetup_time_option((select id from made), now() + interval '1 day', now() + interval '1 day 2 hours');
select public.confirm_meetup_time((select id from made), (select o.id from public.meetup_time_options o where o.meetup_id = (select id from made)));
reset role;
select is((select count(distinct action_path)::text || ' ' || min(action_path) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02'),
  '1 /meetups/' || (select id from made), 'the invitation and the confirmed time both open the meetup itself');
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending' and due_at = now() + interval '1 day' - interval '30 minutes'), 2::bigint, 'the organizer and the guest are reminded half an hour before');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c02',true);
select public.respond_meetup_rsvp((select id from made), 'declined');
reset role;
select is((select status from public.reminders where category = 'upcoming_event' and user_id = '00000000-0000-4000-8000-000000000c02'), 'canceled', 'someone who declines is not reminded');
set local role authenticated;
select public.respond_meetup_rsvp((select id from made), 'going');
reset role;
select is((select status from public.reminders where category = 'upcoming_event' and user_id = '00000000-0000-4000-8000-000000000c02'), 'pending', 'and is again after changing their mind');

-- The reminder becomes a notification when it is due.
update public.reminders set due_at = now() - interval '1 minute' where category = 'upcoming_event' and user_id = '00000000-0000-4000-8000-000000000c02';
select is(private.deliver_due_reminders(), 1, 'a due reminder goes to the inbox');
select is((select title || ' → ' || action_path from public.notifications where category = 'upcoming_event'), 'Sắp diễn ra: Ăn tối → /meetups/' || (select id from made), 'named after the meetup, and it opens the meetup');
select ok((select body ~ '^Bắt đầu lúc [0-9]{2}:[0-9]{2}$' from public.notifications where category = 'upcoming_event'), 'with the hour it starts, on the reader''s clock');

-- A cancelled meetup reminds nobody, also when the reminder itself was missed by the cancellation.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
select public.cancel_meetup((select id from made));
reset role;
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending'), 0::bigint, 'cancelling the meetup drops its reminders');
insert into public.reminders(user_id, category, related_id, due_at, payload, idempotency_key)
values ('00000000-0000-4000-8000-000000000c03', 'upcoming_event', (select id from made), now(), jsonb_build_object('kind', 'meetup', 'starts_at', now() + interval '30 minutes', 'title', 'Sắp diễn ra: Ăn tối'), 'stale-meetup');
select private.deliver_due_reminders();
select is((select status from public.reminders where idempotency_key = 'stale-meetup'), 'canceled', 'a reminder is checked again when it is due, and one for a cancelled meetup is dropped');
select is((select count(*) from public.notifications where dedupe_key = 'stale-meetup'), 0::bigint, 'without reaching anyone');

-- 4. Events: shown to a friend once, a change told once, and taken away with the sharing.
delete from public.notifications; delete from public.reminders;
insert into public.calendar_events(id, owner_id, title, event_kind, start_at, end_at, timezone, visibility)
values ('00000000-0000-4000-8000-000000000ce1','00000000-0000-4000-8000-000000000c01','Họp nhóm','timed', now() + interval '2 days', now() + interval '2 days 1 hour','Asia/Ho_Chi_Minh','selected_friends');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000c01',true);
select public.set_calendar_event_audience('00000000-0000-4000-8000-000000000ce1', array['00000000-0000-4000-8000-000000000c02']::uuid[]);
select public.set_calendar_event_audience('00000000-0000-4000-8000-000000000ce1', array['00000000-0000-4000-8000-000000000c02']::uuid[]);
reset role;
set constraints all immediate;
select is((select count(*)::text || ' ' || max(title) || ' → ' || max(action_path) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02' and category = 'event_shared'),
  '1 An chia sẻ một sự kiện với bạn → /calendar/shared/00000000-0000-4000-8000-000000000c01', 'the friend is told once that an event is shown to them, however often the list is saved');
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending' and related_id = '00000000-0000-4000-8000-000000000ce1'), 2::bigint, 'the owner and the friend are reminded before it starts');
update public.calendar_events set title = 'Họp nhóm đồ án' where id = '00000000-0000-4000-8000-000000000ce1';
update public.calendar_events set start_at = now() + interval '3 days', end_at = now() + interval '3 days 1 hour' where id = '00000000-0000-4000-8000-000000000ce1';
select is((select count(*)::text || ' ' || max(body) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02' and category = 'event_changed'), '1 Họp nhóm đồ án', 'two changes in a row are told once, with the new name');
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending' and due_at = now() + interval '3 days' - interval '30 minutes'), 2::bigint, 'and the reminders move with the event');

-- The owner makes it private again: the friend's inbox and reminders let go of it.
update public.calendar_events set visibility = 'only_me' where id = '00000000-0000-4000-8000-000000000ce1';
set local role authenticated;
select public.set_calendar_event_audience('00000000-0000-4000-8000-000000000ce1');
reset role;
set constraints all immediate;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000c02'), 0::bigint, 'an event taken back leaves the friend''s inbox');
select is((select count(*) from public.reminders where user_id = '00000000-0000-4000-8000-000000000c02' and status = 'pending'), 0::bigint, 'and nothing about it will be pushed to them');
select is((select count(*) from public.reminders where user_id = '00000000-0000-4000-8000-000000000c01' and category = 'upcoming_event' and status = 'pending'), 1::bigint, 'the owner is still reminded');

-- A repeating event has no reminder, and a deleted one loses its own.
update public.calendar_events set recurrence_rule = 'weekly' where id = '00000000-0000-4000-8000-000000000ce1';
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending'), 0::bigint, 'an event that repeats is not reminded about');
update public.calendar_events set recurrence_rule = null where id = '00000000-0000-4000-8000-000000000ce1';
delete from public.calendar_events where id = '00000000-0000-4000-8000-000000000ce1';
select is((select count(*) from public.reminders where category = 'upcoming_event' and status = 'pending'), 0::bigint, 'nor is a deleted one');
select * from finish();
rollback;
