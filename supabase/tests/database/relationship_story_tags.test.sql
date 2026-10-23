-- Shared relationship labels on stories must follow the story's audience.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id, instance_id, aud, role, email) values
 ('00000000-0000-4000-8000-00000000c101','00000000-0000-0000-0000-000000000000','authenticated','authenticated','story-owner@example.invalid'),
 ('00000000-0000-4000-8000-00000000c102','00000000-0000-0000-0000-000000000000','authenticated','authenticated','story-partner@example.invalid'),
 ('00000000-0000-4000-8000-00000000c103','00000000-0000-0000-0000-000000000000','authenticated','authenticated','story-stranger@example.invalid');
update public.profiles set username='story-owner', display_name='An' where id='00000000-0000-4000-8000-00000000c101';
update public.profiles set username='story-partner', display_name='Binh' where id='00000000-0000-4000-8000-00000000c102';
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-00000000c101','00000000-0000-4000-8000-00000000c102','accepted');
insert into storage.objects(bucket_id, name, owner_id) values
 ('moments','00000000-0000-4000-8000-00000000c101/00000000-0000-4000-8000-00000000c201.jpg','00000000-0000-4000-8000-00000000c101'),
 ('moments','00000000-0000-4000-8000-00000000c101/00000000-0000-4000-8000-00000000c202.jpg','00000000-0000-4000-8000-00000000c101'),
 ('moments','00000000-0000-4000-8000-00000000c101/00000000-0000-4000-8000-00000000c203.jpg','00000000-0000-4000-8000-00000000c101');
create function pg_temp.as(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub', p_user, true) $$;

set local role authenticated;
select pg_temp.as('00000000-0000-4000-8000-00000000c101');
select is((select set_config('test.relationship_invite', public.send_friend_relationship_invite('00000000-0000-4000-8000-00000000c102','Tình yêu')::text, true) is not null), true, 'friends can propose a shared relationship');
select pg_temp.as('00000000-0000-4000-8000-00000000c102');
select lives_ok($$select public.respond_friend_relationship_invite(current_setting('test.relationship_invite')::uuid, true)$$, 'the recipient accepts the relationship');
select is((select relationship from public.list_my_friend_relationships()), 'Tình yêu', 'the accepted label appears in the partner relationship list');

select pg_temp.as('00000000-0000-4000-8000-00000000c101');
select lives_ok($$select public.post_moment('00000000-0000-4000-8000-00000000c201',1080,810,null,'',null,false,120,'00000000-0000-4000-8000-00000000c102')$$, 'the owner can post a story with an accepted relationship');
select is((select partner_name || ' · ' || relationship from public.list_moment_relationship_tags(array['00000000-0000-4000-8000-00000000c201']::uuid[])), 'Binh · Tình yêu', 'the owner sees the saved relationship label');
select pg_temp.as('00000000-0000-4000-8000-00000000c102');
select is((select partner_name || ' · ' || relationship from public.list_moment_relationship_tags(array['00000000-0000-4000-8000-00000000c201']::uuid[])), 'Binh · Tình yêu', 'the relationship partner sees the label on their story');
select pg_temp.as('00000000-0000-4000-8000-00000000c103');
select is((select count(*) from public.list_moment_relationship_tags(array['00000000-0000-4000-8000-00000000c201']::uuid[])), 0::bigint, 'a stranger cannot discover the relationship label');

select pg_temp.as('00000000-0000-4000-8000-00000000c101');
select throws_ok($$select public.post_moment('00000000-0000-4000-8000-00000000c202',1080,810,null,'','{}'::uuid[],false,120,'00000000-0000-4000-8000-00000000c102')$$,
  'P0001','relationship person must see the photo','a selected audience must include the person named by the relationship');
select throws_ok($$select public.post_moment('00000000-0000-4000-8000-00000000c203',1080,810,null,'',null,false,120,'00000000-0000-4000-8000-00000000c103')$$,
  'P0001','relationship unavailable','a story cannot tag someone without an accepted relationship');
select * from finish();
rollback;
