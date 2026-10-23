-- Disposable database: all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','relation-me@example.invalid'),
 ('00000000-0000-4000-8000-00000000b002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','relation-a@example.invalid'),
 ('00000000-0000-4000-8000-00000000b003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','relation-b@example.invalid'),
 ('00000000-0000-4000-8000-00000000b004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','relation-stranger@example.invalid');
update public.profiles set username='relation-me', display_name='Me' where id='00000000-0000-4000-8000-00000000b001';
update public.profiles set username='relation-a', display_name='An' where id='00000000-0000-4000-8000-00000000b002';
update public.profiles set username='relation-b', display_name='Binh' where id='00000000-0000-4000-8000-00000000b003';
insert into public.friendships(requester_id, addressee_id, status) values
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b002','accepted'),
 ('00000000-0000-4000-8000-00000000b001','00000000-0000-4000-8000-00000000b003','accepted');
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, true) $$;

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000b001');
select is((select set_config('test.relationship_invite', public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b002','Bạn thân')::text, true) is not null), true, 'a friend can send a relationship proposal');
select is((select direction || ' ' || relationship || ' ' || other_name from public.list_friend_relationship_invites()), 'outgoing Bạn thân An', 'the sender sees the pending proposal and friend');
select throws_ok($$select public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b002','Tình yêu')$$, 'P0001', 'relationship invite already pending', 'a pair cannot create duplicate pending proposals');
select throws_ok($$select public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b004','Bạn bè')$$, 'P0001', 'both people must be your friends', 'a proposal cannot be sent to a stranger');
select throws_ok($$select public.respond_friend_relationship_invite(current_setting('test.relationship_invite')::uuid,true)$$, 'P0001', 'relationship invitation not found', 'the sender cannot accept their own proposal');
select throws_ok($$select * from public.friend_relationship_invites$$, '42501', null, 'the backing invitation table is private');

select pg_temp.as('00000000-0000-4000-8000-00000000b002');
select is((select direction || ' ' || relationship || ' ' || other_name from public.list_friend_relationship_invites()), 'incoming Bạn thân Me', 'the recipient sees an incoming proposal');
select lives_ok($$select public.respond_friend_relationship_invite(current_setting('test.relationship_invite')::uuid,true)$$, 'the recipient can accept the proposal');
select is((select relationship from public.list_my_friend_relationships()), 'Bạn thân', 'acceptance creates a shared relationship');
select throws_ok($$select * from public.friend_relationships$$, '42501', null, 'the backing relationship table is private');
select throws_ok($$select public.respond_friend_relationship_invite(current_setting('test.relationship_invite')::uuid,true)$$, 'P0001', 'relationship invitation not found', 'an invitation cannot be accepted twice');

select pg_temp.as('00000000-0000-4000-8000-00000000b001');
select is((select relationship || ' ' || friend_name from public.list_my_friend_relationships()), 'Bạn thân An', 'the sender sees the accepted relationship too');
select throws_ok($$select public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b002','Bạn thân')$$, 'P0001', 'relationship already exists', 'an accepted relationship cannot be invited again');
select is((select set_config('test.canceled_invite', public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b003','Gia đình')::text, true) is not null), true, 'a second friend can receive an independent proposal');
select lives_ok($$select public.cancel_friend_relationship_invite(current_setting('test.canceled_invite')::uuid)$$, 'the sender can cancel a pending proposal');
select is((select count(*) from public.list_friend_relationship_invites()), 0::bigint, 'a canceled proposal leaves the pending inbox');
select is((select set_config('test.declined_invite', public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000b003','Đồng nghiệp')::text, true) is not null), true, 'a new proposal can be sent after cancellation');

select pg_temp.as('00000000-0000-4000-8000-00000000b003');
select is((select direction || ' ' || relationship from public.list_friend_relationship_invites()), 'incoming Đồng nghiệp', 'the second friend receives their own proposal');
select lives_ok($$select public.respond_friend_relationship_invite(current_setting('test.declined_invite')::uuid,false)$$, 'the recipient can decline a proposal');
select is((select count(*) from public.list_my_friend_relationships()), 0::bigint, 'declining does not create a shared relationship');
select is((select count(*) from public.list_friend_relationship_invites()), 0::bigint, 'a declined proposal leaves the pending inbox');

reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-00000000b002' and action_path like '/me/relationships?invite=%'), 1::bigint, 'the incoming proposal notifies its recipient with a deep link');
select * from finish();
rollback;
