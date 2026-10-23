-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-00000000a001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','map-admin@example.invalid'),
 ('00000000-0000-4000-8000-00000000a002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','map-friend-a@example.invalid'),
 ('00000000-0000-4000-8000-00000000a003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','map-friend-b@example.invalid'),
 ('00000000-0000-4000-8000-00000000a004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','map-outsider@example.invalid');
update public.profiles set username='tk1ll3r', display_name='Admin' where id='00000000-0000-4000-8000-00000000a001';
update public.profiles set display_name='Friend A' where id='00000000-0000-4000-8000-00000000a002';
update public.profiles set display_name='Friend B' where id='00000000-0000-4000-8000-00000000a003';
update public.profiles set display_name='Tester' where id='00000000-0000-4000-8000-00000000a004';
insert into public.friendships(requester_id, addressee_id, status) values
 ('00000000-0000-4000-8000-00000000a001','00000000-0000-4000-8000-00000000a002','accepted'),
 ('00000000-0000-4000-8000-00000000a003','00000000-0000-4000-8000-00000000a001','accepted');
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, true) $$;

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000a001');
select is(public.is_feedback_recipient(), true, 'the username tk1ll3r is the feedback recipient');
select is((select count(*) from public.list_friend_relationships()), 0::bigint, 'the relationship map starts empty');
select lives_ok($$select public.set_friend_relationship('00000000-0000-4000-8000-00000000a002','00000000-0000-4000-8000-00000000a003','Tình yêu')$$, 'two accepted friends can be linked with a custom relationship');
select is((select user_a_id::text || ' ' || user_b_id::text || ' ' || relationship from public.list_friend_relationships()),
 '00000000-0000-4000-8000-00000000a002 00000000-0000-4000-8000-00000000a003 Tình yêu', 'the owner can read the canonical pair and label');
select lives_ok($$select public.set_friend_relationship('00000000-0000-4000-8000-00000000a003','00000000-0000-4000-8000-00000000a002','Bạn thân')$$, 'saving the same pair in reverse updates it');
select is((select count(*) || ' ' || max(relationship) from public.list_friend_relationships()), '1 Bạn thân', 'reverse order never creates a duplicate edge');
select throws_ok($$select public.set_friend_relationship('00000000-0000-4000-8000-00000000a002','00000000-0000-4000-8000-00000000a004','Bạn bè')$$, 'P0001', 'both people must be your friends', 'a stranger cannot be added to the map');
select throws_ok($$select public.set_friend_relationship('00000000-0000-4000-8000-00000000a002','00000000-0000-4000-8000-00000000a002','Bạn bè')$$, 'P0001', 'choose two different friends', 'a person cannot be linked to themself');
select throws_ok($$select public.set_friend_relationship('00000000-0000-4000-8000-00000000a002','00000000-0000-4000-8000-00000000a003','  ')$$, 'P0001', 'relationship label must be 1 to 40 characters', 'an empty relationship label is rejected');
select throws_ok($$select * from public.friend_relationship_edges$$, '42501', null, 'the backing table cannot be read through the API');

select pg_temp.as('00000000-0000-4000-8000-00000000a004');
select is(public.is_feedback_recipient(), false, 'other accounts do not have the feedback inbox');
select is((select count(*) from public.list_friend_relationships()), 0::bigint, 'friend links are private to their owner');
select lives_ok($$select public.submit_admin_feedback('The mobile calendar is hard to use')$$, 'a signed-in account can send feedback');
select throws_ok($$select public.submit_admin_feedback('  ')$$, 'P0001', 'feedback must be 1 to 3000 characters', 'empty feedback is rejected');
select throws_ok($$select * from public.list_admin_feedback()$$, 'P0001', 'admin required', 'a sender cannot open the admin inbox');
select throws_ok($$select public.mark_admin_feedback_read(gen_random_uuid())$$, 'P0001', 'admin required', 'a sender cannot mark admin feedback as read');
reset role;

select is((select count(*) from public.admin_feedback where recipient_id='00000000-0000-4000-8000-00000000a001' and message='The mobile calendar is hard to use'), 1::bigint, 'feedback is routed to the tk1ll3r account');
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-00000000a001' and category='admin_feedback' and action_path='/feedback'), 1::bigint, 'the recipient gets an inbox notification that opens feedback');
set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000a001');
select is((select count(*) from public.list_admin_feedback() where sender_name='Tester'), 1::bigint, 'the inbox shows the sender display name');
select is((select count(*) from public.list_admin_feedback() where message='The mobile calendar is hard to use'), 1::bigint, 'the admin can read the feedback');
select lives_ok($$select public.mark_admin_feedback_read((select id from public.list_admin_feedback() where message='The mobile calendar is hard to use'))$$, 'the admin can mark a message read');
reset role;
select is((select read_at is not null from public.admin_feedback where recipient_id='00000000-0000-4000-8000-00000000a001'), true, 'the inbox stores its read state');
select is(has_function_privilege('anon','public.submit_admin_feedback(text)','EXECUTE'), false, 'anonymous visitors cannot submit feedback');

select * from finish();
rollback;
