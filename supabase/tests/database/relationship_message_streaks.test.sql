-- Disposable database: all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, instance_id, aud, role, email) values
 ('00000000-0000-4000-8000-00000000d001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','streak-me@example.invalid'),
 ('00000000-0000-4000-8000-00000000d002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','streak-friend@example.invalid');
update public.profiles set username='streak-me', display_name='Me' where id='00000000-0000-4000-8000-00000000d001';
update public.profiles set username='streak-friend', display_name='Friend' where id='00000000-0000-4000-8000-00000000d002';
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000d002','accepted');
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, true) $$;

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select set_config('test.streak_conversation', public.open_direct_conversation('00000000-0000-4000-8000-00000000d002')::text, true);
select lives_ok($$select public.send_message('00000000-0000-4000-8000-00000000d010', current_setting('test.streak_conversation')::uuid, 'Before we agreed')$$, 'messages can exist before a mutual relationship');
reset role;
update public.messages set created_at = (pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - 8 + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
where id = '00000000-0000-4000-8000-00000000d010';

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select set_config('test.streak_invite', public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000d002', 'Bạn thân')::text, true);
select pg_temp.as('00000000-0000-4000-8000-00000000d002');
select lives_ok($$select public.respond_friend_relationship_invite(current_setting('test.streak_invite')::uuid, true)$$, 'a relationship begins when both people agree');
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select is((select last_message_at is null from public.list_my_friend_relationships()), true, 'messages from before acceptance do not count toward the relationship');
select lives_ok($$select public.send_message('00000000-0000-4000-8000-00000000d011', current_setting('test.streak_conversation')::uuid, 'Today one')$$, 'one person can start the message streak');
select lives_ok($$select public.send_message('00000000-0000-4000-8000-00000000d012', current_setting('test.streak_conversation')::uuid, 'Today two')$$, 'several messages on one day are accepted');
select lives_ok($$select public.send_message('00000000-0000-4000-8000-00000000d013', current_setting('test.streak_conversation')::uuid, 'Yesterday')$$, 'another day of messages is accepted');
select lives_ok($$select public.send_message('00000000-0000-4000-8000-00000000d014', current_setting('test.streak_conversation')::uuid, 'Two days ago')$$, 'a third consecutive day is accepted');

reset role;
update public.friend_relationships
set created_at = (pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - 4 + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
where user_a_id = '00000000-0000-4000-8000-00000000d001' and user_b_id = '00000000-0000-4000-8000-00000000d002';
update public.messages message
set created_at = (pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - activity.days_ago + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
from (values
  ('00000000-0000-4000-8000-00000000d011'::uuid, 0),
  ('00000000-0000-4000-8000-00000000d012'::uuid, 0),
  ('00000000-0000-4000-8000-00000000d013'::uuid, 1),
  ('00000000-0000-4000-8000-00000000d014'::uuid, 2)
) as activity(message_id, days_ago)
where message.id = activity.message_id;

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select is((select current_streak from public.list_my_friend_relationships()), 3, 'daily direct messages create a three-day streak; multiple messages today count once');
select is((select pg_catalog.timezone('Asia/Ho_Chi_Minh', last_message_at)::date = pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date from public.list_my_friend_relationships()), true, 'the relationship exposes its latest message day');
reset role;

update public.messages set created_at = (pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - 4 + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
where id = '00000000-0000-4000-8000-00000000d014';
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select is((select current_streak from public.list_my_friend_relationships()), 2, 'a missing day ends the older part of the streak');
reset role;

update public.messages set created_at = (pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - case
  when id in ('00000000-0000-4000-8000-00000000d011','00000000-0000-4000-8000-00000000d012') then 2
  when id = '00000000-0000-4000-8000-00000000d013' then 3
  else 4
end + time '12:00') at time zone 'Asia/Ho_Chi_Minh'
where id in (
  '00000000-0000-4000-8000-00000000d011','00000000-0000-4000-8000-00000000d012',
  '00000000-0000-4000-8000-00000000d013','00000000-0000-4000-8000-00000000d014'
);
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000d001');
select is((select current_streak from public.list_my_friend_relationships()), 0, 'a streak older than yesterday is no longer current');

reset role;
set local role authenticated;
select throws_ok($$select * from public.friend_relationships$$, '42501', null, 'the relationship backing table stays private');
select * from finish();
rollback;
