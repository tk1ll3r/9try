-- Disposable local database only; all fixtures roll back.
-- a = b01 and b = b02 are friends. g = b03 owns a group with a (admin) and m = b04 (member). s = b05 is a stranger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

insert into auth.users(id, instance_id, aud, role, email)
select ('00000000-0000-4000-8000-000000000b0' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'act-' || n || '@example.invalid'
from generate_series(1, 5) n;
update public.profiles set display_name = 'An' where id = '00000000-0000-4000-8000-000000000b01';
update public.profiles set display_name = 'Bình' where id = '00000000-0000-4000-8000-000000000b02';
insert into public.friendships(requester_id, addressee_id, status) values ('00000000-0000-4000-8000-000000000b01','00000000-0000-4000-8000-000000000b02','accepted');
insert into public.groups(id, owner_id, name, member_count) values ('00000000-0000-4000-8000-000000000bb1','00000000-0000-4000-8000-000000000b03','Lớp',3);
insert into public.group_memberships(group_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000bb1','00000000-0000-4000-8000-000000000b03','owner'),
  ('00000000-0000-4000-8000-000000000bb1','00000000-0000-4000-8000-000000000b01','admin'),
  ('00000000-0000-4000-8000-000000000bb1','00000000-0000-4000-8000-000000000b04','member');
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b0' || p_user, true) $$;
create function pg_temp.direct() returns uuid language sql stable as $$ select current_setting('test.direct')::uuid $$;
create function pg_temp.class() returns uuid language sql stable as $$ select current_setting('test.class')::uuid $$;

set local role authenticated;
select pg_temp.as('1');
select set_config('test.direct', public.open_direct_conversation('00000000-0000-4000-8000-000000000b02')::text, true);
select set_config('test.class', public.open_group_conversation('00000000-0000-4000-8000-000000000bb1')::text, true);
select public.send_message('00000000-0000-4000-8000-0000000000a1', pg_temp.direct(), 'Tối nay đi ăn không?');

-- Replies.
select pg_temp.as('2');
select lives_ok($$select public.post_message('00000000-0000-4000-8000-0000000000a2', pg_temp.direct(), 'Đi, 7 giờ nhé', '00000000-0000-4000-8000-0000000000a1')$$, 'a message can answer another of its conversation');
select is((select reply_to->>'body' || ' / ' || (reply_to->>'sender_name') from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a2'),
  'Tối nay đi ăn không? / An', 'and carries a line of what it answers, with who wrote it');
select pg_temp.as('1');
select public.send_message('00000000-0000-4000-8000-0000000000c1', pg_temp.class(), 'Thông báo lớp');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000a3', pg_temp.direct(), 'x', '00000000-0000-4000-8000-0000000000c1')$$,
  'P0001', 'message not found', 'a reply cannot point into another conversation');

-- Reactions.
select pg_temp.as('2');
select lives_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'heart')$$, 'a participant reacts');
select lives_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'laugh')$$, 'and changes the reaction');
select throws_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'poop')$$, 'P0001', 'invalid reaction', 'a reaction outside the six is refused');
select pg_temp.as('1');
select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'laugh');
select is((select reactions::text || ' ' || my_reaction from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a1'), '{"laugh": 2} laugh', 'reactions are counted by kind, one per person, with the reader''s own');
select public.react_to_message('00000000-0000-4000-8000-0000000000a1', null);
select is((select reactions::text || ' ' || coalesce(my_reaction, '-') from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a1'), '{"laugh": 1} -', 'a reaction can be taken back');
select pg_temp.as('5');
select throws_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'heart')$$, 'P0001', 'message not found', 'a stranger cannot react');

-- Editing: one's own text, within 15 minutes.
select pg_temp.as('2');
select lives_ok($$select public.edit_message('00000000-0000-4000-8000-0000000000a2', '  Đi, 7 rưỡi nhé ')$$, 'the sender changes their message');
select is((select body || ' ' || edited::text from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a2'), 'Đi, 7 rưỡi nhé true', 'which then reads the new text and says it was changed');
select throws_ok($$select public.edit_message('00000000-0000-4000-8000-0000000000a1', 'x')$$, 'P0001', 'message not found', 'nobody changes someone else''s message');
select throws_ok($$select public.edit_message('00000000-0000-4000-8000-0000000000a2', '   ')$$, 'P0001', 'invalid message', 'a message cannot be changed to nothing');
reset role;
update public.messages set created_at = now() - interval '16 minutes' where id = '00000000-0000-4000-8000-0000000000a2';
set local role authenticated;
select pg_temp.as('2');
select throws_ok($$select public.edit_message('00000000-0000-4000-8000-0000000000a2', 'Muộn rồi')$$, 'P0001', 'too late to edit', 'after 15 minutes a message can no longer be changed');

-- "Đã xem".
select pg_temp.as('1');
select is((select display_name || ' ' || (last_read_at is not null)::text from public.list_conversation_reads(pg_temp.direct())), 'Bình true', 'a participant sees how far the other person has read');
select is((select count(*) from public.list_conversation_reads(pg_temp.class())), 2::bigint, 'in a group, how far each other member has read');
select pg_temp.as('5');
select throws_ok($$select * from public.list_conversation_reads(pg_temp.direct())$$, 'P0001', 'not a participant', 'a stranger learns nothing about who read what');

-- Mute, for any conversation.
reset role;
delete from public.notifications;
set local role authenticated;
select pg_temp.as('2');
select lives_ok($$select public.set_conversation_mute(pg_temp.direct(), 60)$$, 'a conversation is muted for an hour');
select is((select muted::text || ' ' || (muted_until > now() + interval '59 minutes')::text from public.list_conversations() where id = pg_temp.direct()), 'true true', 'and listed as muted until then');
select pg_temp.as('1');
select public.send_message('00000000-0000-4000-8000-0000000000a4', pg_temp.direct(), 'Nhớ mang áo mưa');
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000b02'), 0::bigint, 'a message in a muted conversation is not told');
set local role authenticated;
select pg_temp.as('2');
select is((select unread_count from public.list_conversations() where id = pg_temp.direct()), 1, 'it is still counted as unread');
select public.set_conversation_mute(pg_temp.direct(), 0);
select is((select muted_until::text from public.list_conversations() where id = pg_temp.direct()), 'infinity', 'a conversation can be muted until it is turned back on');
select public.set_conversation_mute(pg_temp.direct(), null);
select is((select muted::text || ' ' || coalesce(muted_until::text, '-') from public.list_conversations() where id = pg_temp.direct()), 'false -', 'and turned back on');
select pg_temp.as('1');
select public.send_message('00000000-0000-4000-8000-0000000000a5', pg_temp.direct(), 'Đang tới');
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000b02' and category = 'chat_message'), 1::bigint, 'after that a message is told again');

-- Search.
set local role authenticated;
select pg_temp.as('2');
select is((select string_agg(body, ' | ' order by created_at) from public.search_messages(pg_temp.direct(), 'ÁO MƯA')), 'Nhớ mang áo mưa', 'text is found whatever the case');
select is((select string_agg(body, ' | ' order by created_at) from public.search_messages(pg_temp.direct(), 'ao mua')), 'Nhớ mang áo mưa', 'and whether or not it is typed with its marks');
select is((select count(*) from public.search_messages(pg_temp.direct(), 'a')), 0::bigint, 'one letter is not searched for');
select is((select count(*) from public.search_messages(pg_temp.direct(), '%')), 0::bigint, 'a sign of the search language is looked for as it is written');
select pg_temp.as('5');
select throws_ok($$select * from public.search_messages(pg_temp.direct(), 'mang')$$, 'P0001', 'not a participant', 'a stranger cannot search a conversation');

-- Unsending.
select pg_temp.as('1');
select throws_ok($$select public.delete_message('00000000-0000-4000-8000-0000000000a2')$$, 'P0001', 'message not found', 'in a direct conversation nobody takes back the other person''s message');
select pg_temp.as('2');
select public.react_to_message('00000000-0000-4000-8000-0000000000a4', 'like');
select pg_temp.as('1');
select lives_ok($$select public.delete_message('00000000-0000-4000-8000-0000000000a4')$$, 'the sender takes a message back, at any time');
select is((select body || ' ' || deleted::text || ' ' || reactions::text from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a4'),
  'Tin nhắn đã thu hồi true {}', 'everyone then reads that it was taken back, and its reactions are gone');
reset role;
select is((select body from public.messages where id = '00000000-0000-4000-8000-0000000000a4'), '', 'the text itself is erased from the table');
set local role authenticated;
select pg_temp.as('2');
select is((select count(*) from public.search_messages(pg_temp.direct(), 'áo mưa')), 0::bigint, 'a message that was taken back is not found by search');
select throws_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a4', 'sad')$$, 'P0001', 'message not found', 'nor can it be reacted to');
select is((select last_message_body from public.list_conversations() where id = pg_temp.direct()), 'Đang tới', 'the list of conversations shows the last message');
select pg_temp.as('1');
select public.delete_message('00000000-0000-4000-8000-0000000000a5');
select is((select last_message_body from public.list_conversations() where id = pg_temp.direct()), 'Tin nhắn đã thu hồi', 'or that the last one was taken back');
select is((select reply_to->>'deleted' from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000a2'), 'false', 'an answer still shows what it answered while that message stands');

-- A group: its owner and admins take back any message, a member only their own.
select pg_temp.as('4');
select public.send_message('00000000-0000-4000-8000-0000000000c2', pg_temp.class(), 'Tin của thành viên');
select throws_ok($$select public.delete_message('00000000-0000-4000-8000-0000000000c1')$$, 'P0001', 'message not found', 'a member cannot take back someone else''s message');
select pg_temp.as('1');
select lives_ok($$select public.delete_message('00000000-0000-4000-8000-0000000000c2')$$, 'an admin of the group takes back a member''s message');
select pg_temp.as('3');
select lives_ok($$select public.delete_message('00000000-0000-4000-8000-0000000000c1')$$, 'and so does the owner');
select is((select count(*) from public.list_messages(pg_temp.class()) where deleted), 2::bigint, 'both read as taken back');

-- Photos and cards. The files are in the bucket before the message names them.
reset role;
insert into storage.objects(bucket_id, name, owner_id) values
  ('chat', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000d1/0.jpg', '00000000-0000-4000-8000-000000000b01'),
  ('chat', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000d1/1.jpg', '00000000-0000-4000-8000-000000000b01'),
  ('chat', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000d9/0.jpg', '00000000-0000-4000-8000-000000000b02');
create function pg_temp.files(p_message text, p_count integer) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('path', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000' || p_message || '/' || n || '.jpg', 'width', 1280, 'height', 960)) from generate_series(0, p_count - 1) n
$$;
set local role authenticated;
select pg_temp.as('1');
select lives_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d1', pg_temp.direct(), '', null, pg_temp.files('d1', 2))$$, 'a message carries photos that its sender put in the bucket, without any text');
select is((select kind || ' ' || jsonb_array_length(attachments) || ' ' || body from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000d1'), 'photo 2 Đã gửi ảnh', 'it is a photo message; a build that knows only text reads one line');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d9', pg_temp.direct(), '', null, pg_temp.files('d9', 1))$$, 'P0001', 'invalid attachment', 'a file that someone else put there cannot be sent as one''s own');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d2', pg_temp.direct(), '', null, pg_temp.files('d1', 1))$$, 'P0001', 'invalid attachment', 'nor a file of another message');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d3', pg_temp.direct(), '')$$, 'P0001', 'invalid message', 'a message with nothing in it is refused');
select throws_ok($$select public.edit_message('00000000-0000-4000-8000-0000000000d1', 'chú thích')$$, 'P0001', 'message not found', 'a photo message is not changed afterwards');
select lives_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d4', pg_temp.direct(), 'Đi không?', null, null, '/meetups/00000000-0000-4000-8000-0000000000ee', 'Ăn tối · 18:00')$$, 'a message carries a card that opens something in the app');
select is((select kind || ' ' || ref_path || ' ' || ref_title from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000d4'), 'card /meetups/00000000-0000-4000-8000-0000000000ee Ăn tối · 18:00', 'with its path and its title');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d5', pg_temp.direct(), 'x', null, null, 'https://evil.example/x', 'Bẫy')$$, 'P0001', 'invalid card', 'a card cannot lead outside the app');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000d5', pg_temp.direct(), 'x', null, null, '//evil.example/x', 'Bẫy')$$, 'P0001', 'invalid card', 'in either way of writing it');
select is((select count(*) from storage.objects where bucket_id = 'chat'), 2::bigint, 'the sender reads the files they added, and not a file of someone else that no message names');
select lives_ok($$insert into storage.objects(bucket_id, name, owner_id) values ('chat', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000d6/0.jpg', '00000000-0000-4000-8000-000000000b01')$$, 'and adds a file to it');
select pg_temp.as('2');
select is((select count(*) from storage.objects where bucket_id = 'chat'), 3::bigint, 'the other person reads the two photos of the message and their own upload, and not a file that is not sent yet');
select pg_temp.as('5');
select is((select count(*) from storage.objects where bucket_id = 'chat'), 0::bigint, 'a stranger reads none of them');
select throws_ok($$insert into storage.objects(bucket_id, name, owner_id) values ('chat', current_setting('test.direct') || '/00000000-0000-4000-8000-0000000000d7/0.jpg', '00000000-0000-4000-8000-000000000b05')$$, '42501', null, 'and adds none');

-- Taking a photo message back lets go of its files, which the worker then removes.
select pg_temp.as('1');
select public.delete_message('00000000-0000-4000-8000-0000000000d1');
select is((select coalesce(attachments::text, '-') || ' ' || body from public.list_messages(pg_temp.direct()) where id = '00000000-0000-4000-8000-0000000000d1'), '- Tin nhắn đã thu hồi', 'a photo message that was taken back names no file');
select pg_temp.as('2');
select is((select count(*) from storage.objects where bucket_id = 'chat' and name like '%0000000000d1/%'), 0::bigint, 'and the other person no longer reads its photos, before any file is removed');
reset role;
update storage.objects set created_at = now() - interval '2 hours' where bucket_id = 'chat' and name like '%0000000000d1/%';
set local role service_role;
select is((select count(*) from public.orphan_media_files() where bucket = 'chat'), 2::bigint, 'its two files are handed to the worker; files written a moment ago are not');
reset role;

-- The typing topic of a conversation is for its participants.
set local role authenticated;
select pg_temp.as('2');
select is(public.can_join_chat_topic('chat:' || current_setting('test.direct')), true, 'a participant may join the typing topic of the conversation');
select pg_temp.as('5');
select is(public.can_join_chat_topic('chat:' || current_setting('test.direct')), false, 'a stranger may not');
select is(public.can_join_chat_topic('chat:not-a-conversation') or public.can_join_chat_topic('user:' || current_setting('test.direct')), false, 'and a topic that is no conversation is nobody''s');

-- After the friendship ends the history stays and nothing is added to it.
select pg_temp.as('1');
select public.remove_friend('00000000-0000-4000-8000-000000000b02');
select throws_ok($$select public.react_to_message('00000000-0000-4000-8000-0000000000a1', 'heart')$$, 'P0001', 'conversation closed', 'no reaction after the friendship ended');
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000a9', pg_temp.direct(), 'x')$$, 'P0001', 'conversation closed', 'and no message');
reset role;

set local role anon;
select throws_ok($$select public.post_message('00000000-0000-4000-8000-0000000000aa', pg_temp.direct(), 'x')$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;
