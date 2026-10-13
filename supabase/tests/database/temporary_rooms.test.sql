-- Disposable local database only; all fixtures roll back.
-- a = f01 organizes and owns, b = f02 is a friend who is invited, c = f03 is a friend who is not, d = f04 is a stranger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000f01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','room-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000f02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','room-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000f03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','room-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000f04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','room-d@example.invalid');
update public.profiles set display_name = 'An' where id = '00000000-0000-4000-8000-000000000f01';
update public.profiles set display_name = 'Bình' where id = '00000000-0000-4000-8000-000000000f02';
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000f01','00000000-0000-4000-8000-000000000f02','accepted'),
  ('00000000-0000-4000-8000-000000000f03','00000000-0000-4000-8000-000000000f01','accepted');
insert into public.meetups(id, organizer_id, title, status, timezone, start_at, end_at)
values ('00000000-0000-4000-8000-000000000fa1','00000000-0000-4000-8000-000000000f01','Ăn tối','confirmed','UTC', now() + interval '1 hour', now() + interval '3 hours');
insert into public.meetup_invitees(meetup_id, user_id, rsvp_status) values
  ('00000000-0000-4000-8000-000000000fa1','00000000-0000-4000-8000-000000000f01','going'),
  ('00000000-0000-4000-8000-000000000fa1','00000000-0000-4000-8000-000000000f02','pending');
delete from public.notifications; delete from public.reminders;
create temp table made(name text primary key, id uuid);
grant select, insert on made to authenticated;
create function pg_temp.room(n text) returns uuid language sql stable as $$ select id from made where name = n $$;

-- Only the organizer turns the discussion on.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select throws_ok($$select public.open_room('meetup', '00000000-0000-4000-8000-000000000fa1')$$, 'P0001', 'room unavailable', 'a guest cannot turn the discussion on');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
insert into made values ('dinner', public.open_room('meetup', '00000000-0000-4000-8000-000000000fa1', null, 'Mấy giờ mọi người tới?'));
select is(public.open_room('meetup', '00000000-0000-4000-8000-000000000fa1'), pg_temp.room('dinner'), 'turning it on again gives the same room');
reset role;
select is((select closes_at from public.conversations where id = pg_temp.room('dinner')), now() + interval '27 hours', 'the room closes a day after the meetup ends');
select is((select title || ' | ' || body || ' → ' || action_path from public.notifications where user_id = '00000000-0000-4000-8000-000000000f02' and dedupe_key like 'room:%'),
  'An mở thảo luận | Ăn tối → /chat/' || pg_temp.room('dinner'), 'the guest is told, with a link to the room');

-- A guest sees that there is a room, reads nothing before joining, then joins and writes.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select is((select title || ' ' || joined || ' ' || member_count from public.list_rooms(null, 'meetup', '00000000-0000-4000-8000-000000000fa1')), 'Ăn tối false 1', 'the guest finds the room from the meetup, not joined yet');
select throws_ok($$select * from public.list_messages(pg_temp.room('dinner'))$$, 'P0001', 'not a participant', 'and reads nothing before joining');
select throws_ok($$select public.send_message(gen_random_uuid(), pg_temp.room('dinner'), 'Chào')$$, 'P0001', 'not a participant', 'nor writes');
select throws_ok($$select * from public.room_members$$, '42501', null, 'the table of members is closed to clients');
select lives_ok($$select public.join_room(pg_temp.room('dinner'))$$, 'the guest joins');
select is((select body from public.list_messages(pg_temp.room('dinner'))), 'Mấy giờ mọi người tới?', 'and reads the opening message');
select public.send_message('00000000-0000-4000-8000-000000000fe1', pg_temp.room('dinner'), '7 giờ nhé');
select is((select kind || ' ' || title || ' ' || closed from public.list_conversations()), 'room Ăn tối false', 'the room is among the guest''s conversations, under the meetup''s name');
select is((select string_agg(display_name, ', ' order by is_owner desc) from public.list_room_members(pg_temp.room('dinner'))), 'An, Bình', 'everyone in the room sees who is in it');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select is((select unread_count from public.list_conversations()), 1, 'the organizer has one unread message');
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000f01' and dedupe_key like 'chat:%'), 1::bigint, 'and a notification about it');

-- A friend who is not invited, and a stranger: no room to find, to join or to read.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f03',true);
select is((select count(*) from public.list_rooms()), 0::bigint, 'a friend who is not invited finds no room');
select throws_ok($$select public.join_room(pg_temp.room('dinner'))$$, 'P0001', 'room unavailable', 'and cannot join one by its id');
select throws_ok($$select * from public.list_messages(pg_temp.room('dinner'))$$, 'P0001', 'not a participant', 'nor read it');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f04',true);
select throws_ok($$select public.join_room(pg_temp.room('dinner'))$$, 'P0001', 'room unavailable', 'a stranger cannot join either');

-- Muted: the messages still count as unread, and nothing is announced.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select public.mark_conversation_read(pg_temp.room('dinner'));
select public.mute_room(pg_temp.room('dinner'), true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select public.send_message('00000000-0000-4000-8000-000000000fe2', pg_temp.room('dinner'), 'Mình tới rồi');
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000f01' and dedupe_key like 'chat:%'), 0::bigint, 'a muted room announces nothing');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select is((select unread_count || ' ' || muted from public.list_conversations()), '1 true', 'but the unread count still shows');

-- Losing the invitation ends the access, without anyone touching the room.
reset role;
insert into public.meetup_invitees(meetup_id, user_id) values ('00000000-0000-4000-8000-000000000fa1','00000000-0000-4000-8000-000000000f03');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f03',true);
select public.join_room(pg_temp.room('dinner'));
select is((select count(*) from public.list_messages(pg_temp.room('dinner'))), 3::bigint, 'once invited, the friend joins and reads');
reset role;
delete from public.meetup_invitees where meetup_id = '00000000-0000-4000-8000-000000000fa1' and user_id = '00000000-0000-4000-8000-000000000f03';
set local role authenticated;
select throws_ok($$select * from public.list_messages(pg_temp.room('dinner'))$$, 'P0001', 'not a participant', 'taken off the invitation, they read nothing more');
select is((select count(*) from public.list_conversations()), 0::bigint, 'and the room is gone from their conversations');

-- The owner removes someone: out, and not back in.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select throws_ok($$select public.remove_room_member(pg_temp.room('dinner'), '00000000-0000-4000-8000-000000000f01')$$, 'P0001', 'room unavailable', 'a guest cannot remove anyone');
select throws_ok($$select public.close_room(pg_temp.room('dinner'))$$, 'P0001', 'room unavailable', 'nor close the room');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select public.remove_room_member(pg_temp.room('dinner'), '00000000-0000-4000-8000-000000000f02');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select throws_ok($$select * from public.list_messages(pg_temp.room('dinner'))$$, 'P0001', 'not a participant', 'someone the owner removed reads nothing');
select throws_ok($$select public.join_room(pg_temp.room('dinner'))$$, 'P0001', 'removed from room', 'and cannot come back');

-- Closed: nothing new can be written, also by its owner, and what was written can still be read.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select public.close_room(pg_temp.room('dinner'));
select throws_ok($$select public.send_message(gen_random_uuid(), pg_temp.room('dinner'), 'Còn ai không?')$$, 'P0001', 'conversation closed', 'a closed room takes no message, even from its owner');
select is((select count(*) from public.list_messages(pg_temp.room('dinner'))), 3::bigint, 'its messages can still be read');
select is((select closed from public.list_conversations()), true, 'and it is listed as closed');

-- The clock closes a room too, and seven days later it is deleted with its messages.
reset role;
update public.conversations set closed_at = null, closes_at = now() - interval '1 minute' where id = pg_temp.room('dinner');
set local role authenticated;
select throws_ok($$select public.send_message(gen_random_uuid(), pg_temp.room('dinner'), 'Muộn rồi')$$, 'P0001', 'conversation closed', 'a room past its time takes no message');
reset role;
update public.conversations set closes_at = now() - interval '8 days' where id = pg_temp.room('dinner');
select private.purge_closed_rooms();
select is((select count(*) from public.conversations where kind = 'room') + (select count(*) from public.messages where conversation_id = pg_temp.room('dinner')), 0::bigint, 'seven days after closing, the room and its messages are deleted');

-- An event: only one that is shown to someone, a room for each time it happens, and the room follows who it is shown to.
insert into public.calendar_events(id, owner_id, title, event_kind, start_at, end_at, timezone, visibility, recurrence_rule) values
  ('00000000-0000-4000-8000-000000000fb1','00000000-0000-4000-8000-000000000f01','Riêng tư','timed', now() + interval '1 day', now() + interval '1 day 1 hour','UTC','only_me', null),
  ('00000000-0000-4000-8000-000000000fb2','00000000-0000-4000-8000-000000000f01','Học nhóm','timed', now() + interval '1 day', now() + interval '1 day 2 hours','UTC','selected_friends', 'weekly');
insert into public.event_shares(event_id, user_id) values ('00000000-0000-4000-8000-000000000fb2','00000000-0000-4000-8000-000000000f02');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select throws_ok($$select public.open_room('event', '00000000-0000-4000-8000-000000000fb1')$$, 'P0001', 'room unavailable', 'an event nobody else sees gets no room');
select throws_ok($$select public.open_room('event', '00000000-0000-4000-8000-000000000fb2')$$, 'P0001', 'room unavailable', 'a repeating event needs to say which time');
insert into made values ('week1', public.open_room('event', '00000000-0000-4000-8000-000000000fb2', (now() + interval '1 day')::date));
insert into made values ('week2', public.open_room('event', '00000000-0000-4000-8000-000000000fb2', (now() + interval '8 days')::date));
select isnt(pg_temp.room('week1'), pg_temp.room('week2'), 'each time a repeating event happens has a room of its own');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f02',true);
select is((select count(*) from public.list_rooms(null, 'event', '00000000-0000-4000-8000-000000000fb2', (now() + interval '1 day')::date)), 1::bigint, 'the friend the event is shown to finds that time''s room');
select public.join_room(pg_temp.room('week1'));
reset role;
delete from public.event_shares where event_id = '00000000-0000-4000-8000-000000000fb2';
set constraints all immediate;
set local role authenticated;
select throws_ok($$select * from public.list_messages(pg_temp.room('week1'))$$, 'P0001', 'not a participant', 'an event no longer shown to them closes its room to them');

-- A mode: the room lasts as long as the mode, and friends who see the mode can join.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select throws_ok($$select public.open_room('mode', '00000000-0000-4000-8000-000000000f01')$$, 'P0001', 'room unavailable', 'without a mode on there is nothing to discuss');
select public.set_my_activity_mode('coffee', 60);
select throws_ok($$select public.open_room('mode', '00000000-0000-4000-8000-000000000f02')$$, 'P0001', 'room unavailable', 'nobody opens a room on someone else''s mode');
insert into made values ('coffee', public.open_room('mode', '00000000-0000-4000-8000-000000000f01'));
select is((select title from public.list_rooms(pg_temp.room('coffee'))), 'mode:coffee', 'the room is named after the activity, by its key');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f03',true);
select is((select joined::text || ' ' || closed::text from public.list_rooms(null, 'mode', '00000000-0000-4000-8000-000000000f01')), 'false false', 'a friend who sees the mode finds its room');
select lives_ok($$select public.join_room(pg_temp.room('coffee'))$$, 'and joins it');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f04',true);
select is((select count(*) from public.list_rooms(null, 'mode', '00000000-0000-4000-8000-000000000f01')), 0::bigint, 'a stranger does not');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000f01',true);
select public.set_my_activity_mode('studying', 60);
select throws_ok($$select public.send_message(gen_random_uuid(), pg_temp.room('coffee'), 'Còn ở quán không?')$$, 'P0001', 'conversation closed', 'another mode ends the room of the one before');

-- A cancelled meetup closes its room.
reset role;
insert into public.meetups(id, organizer_id, title, status, timezone) values ('00000000-0000-4000-8000-000000000fa2','00000000-0000-4000-8000-000000000f01','Đá bóng','proposed','UTC');
set local role authenticated;
insert into made values ('football', public.open_room('meetup', '00000000-0000-4000-8000-000000000fa2'));
select public.cancel_meetup('00000000-0000-4000-8000-000000000fa2');
select is((select closed from public.list_rooms(pg_temp.room('football'))), true, 'cancelling a meetup closes its room');
reset role;
set local role anon;
select throws_ok($$select public.open_room('meetup', '00000000-0000-4000-8000-000000000fa1')$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;
