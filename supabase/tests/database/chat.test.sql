-- Disposable local database only; all fixtures roll back.
-- a = 901, b = 902 (friend of a), c = 903 (stranger), d = 904 (in a's group, not a friend).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000901','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chat-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000902','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chat-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000903','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chat-c@example.invalid'),
 ('00000000-0000-4000-8000-000000000904','00000000-0000-0000-0000-000000000000','authenticated','authenticated','chat-d@example.invalid');
update public.profiles set display_name='An' where id='00000000-0000-4000-8000-000000000901';
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000902','accepted');
insert into public.groups(id, owner_id, name, member_count)
values ('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000901','Chat group',2);
insert into public.group_memberships(group_id, user_id, role)
values ('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000901','owner'),
       ('00000000-0000-4000-8000-0000000009a1','00000000-0000-4000-8000-000000000904','member');

-- Direct conversations exist only between friends.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select throws_ok($$ select public.open_direct_conversation('00000000-0000-4000-8000-000000000903') $$,'P0001','conversation unavailable','a stranger cannot be messaged');
select set_config('test.direct',public.open_direct_conversation('00000000-0000-4000-8000-000000000902')::text,true);
select is(public.open_direct_conversation('00000000-0000-4000-8000-000000000902')::text,current_setting('test.direct'),'a pair of friends has one conversation');

-- Sending: once per id, unread for the other person, one notification until read.
select public.send_message('00000000-0000-4000-8000-0000000009e1',current_setting('test.direct')::uuid,' Chào ');
select public.send_message('00000000-0000-4000-8000-0000000009e1',current_setting('test.direct')::uuid,'Chào');
select public.send_message('00000000-0000-4000-8000-0000000009e2',current_setting('test.direct')::uuid,'Đi cà phê không?');
select is((select unread_count from public.list_conversations()),0,'the sender has nothing unread');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select is((select count(*) from public.list_messages(current_setting('test.direct')::uuid)),2::bigint,'sending the same id twice stores one message');
select is((select body from public.list_messages(current_setting('test.direct')::uuid) order by created_at limit 1),'Chào','the text is trimmed');
select is((select unread_count from public.list_conversations()),2,'the recipient sees two unread messages');
select is((select title from public.list_conversations()),'An','a direct conversation is titled with the other person');
reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message'),1::bigint,'two messages make one notification');
select is((select body from public.notifications where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message'),'','the notification carries no message text');
select is((select count(*) from realtime.messages where event='chat' and topic='user:00000000-0000-4000-8000-000000000902'),2::bigint,'the recipient gets a realtime event per message');

-- Read in the inbox without opening the conversation, and pushed already: the next message is told again.
update public.notifications set read_at=now() where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message';
update public.reminders set status='delivered' where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.send_message('00000000-0000-4000-8000-0000000009ef',current_setting('test.direct')::uuid,'Còn đó không?');
reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message' and read_at is null),1::bigint,'a message after the notification was read in the inbox is told again');
select is((select status from public.reminders where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message'),'pending','and it is queued for a push again');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000902',true);
select public.mark_conversation_read(current_setting('test.direct')::uuid);
select is((select unread_count from public.list_conversations()),0,'reading clears the unread count');
reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000902' and category='chat_message'),0::bigint,'reading removes the notification');

-- Other people have no access.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000903',true);
select throws_ok($$ select * from public.list_messages(current_setting('test.direct')::uuid) $$,'P0001','not a participant','a stranger cannot read the conversation');
select throws_ok($$ select public.send_message('00000000-0000-4000-8000-0000000009e3',current_setting('test.direct')::uuid,'x') $$,'P0001','not a participant','a stranger cannot post in it');
select is((select count(*) from public.messages),0::bigint,'the tables cannot be read directly');

-- Ending the friendship closes the conversation for new messages but keeps the history.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select public.remove_friend('00000000-0000-4000-8000-000000000902');
select throws_ok($$ select public.send_message('00000000-0000-4000-8000-0000000009e4',current_setting('test.direct')::uuid,'x') $$,'P0001','conversation closed','nothing can be sent after the friendship ends');
select is((select count(*) from public.list_messages(current_setting('test.direct')::uuid)),3::bigint,'the history stays readable');
select public.block_user('00000000-0000-4000-8000-000000000902');
select is((select count(*) from public.list_conversations()),0::bigint,'a block hides the conversation');

-- Group conversations follow group membership.
select set_config('test.group',public.open_group_conversation('00000000-0000-4000-8000-0000000009a1')::text,true);
select public.send_message('00000000-0000-4000-8000-0000000009e5',current_setting('test.group')::uuid,'Họp nhóm tối nay');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000904',true);
select is((select count(*) from public.list_messages(current_setting('test.group')::uuid)),1::bigint,'a group member reads the group conversation');
select public.leave_group('00000000-0000-4000-8000-0000000009a1');
select throws_ok($$ select * from public.list_messages(current_setting('test.group')::uuid) $$,'P0001','not a participant','leaving the group ends access');
reset role;

-- Activity counts the last 14 days only.
insert into public.messages(id, conversation_id, sender_id, body, created_at)
values ('00000000-0000-4000-8000-0000000009e9', current_setting('test.group')::uuid, '00000000-0000-4000-8000-000000000901', 'Tin từ tháng trước', now() - interval '20 days');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000901',true);
select is((select recent_messages from public.list_conversations() where id = current_setting('test.group')::uuid), 1, 'activity counts the messages of the last 14 days');
select is((select count(*) from public.list_messages(current_setting('test.group')::uuid)), 2::bigint, 'the older message is still in the history');
reset role;

select * from finish();
rollback;
