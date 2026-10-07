-- Disposable local Supabase Postgres ONLY. No cloud-linked reset or production use.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000601','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000602','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-friend@example.invalid'),
  ('00000000-0000-4000-8000-000000000603','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-stranger@example.invalid'),
  ('00000000-0000-4000-8000-000000000604','00000000-0000-0000-0000-000000000000','authenticated','authenticated','mode-pending@example.invalid');
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000601','00000000-0000-4000-8000-000000000602','accepted'),
  ('00000000-0000-4000-8000-000000000604','00000000-0000-4000-8000-000000000601','pending');
delete from realtime.messages;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
select public.set_my_activity_mode('studying', 60);
reset role;

select is((select count(*) from realtime.messages where event='presence' and topic='user:00000000-0000-4000-8000-000000000602'), 1::bigint, 'an accepted friend is told when a mode is set');
select is((select count(*) from realtime.messages where event='presence' and topic='user:00000000-0000-4000-8000-000000000601'), 1::bigint, 'the owner''s other devices are told too');
select is((select count(*) from realtime.messages where event='presence' and topic in ('user:00000000-0000-4000-8000-000000000603','user:00000000-0000-4000-8000-000000000604')), 0::bigint, 'a stranger and a pending request hear nothing');
select is((select payload from realtime.messages where event='presence' limit 1), '{}'::jsonb, 'the event carries no data about the mode');

set local role authenticated;
select public.set_my_activity_mode(null, 60);
reset role;
select is((select count(*) from realtime.messages where event='presence' and topic='user:00000000-0000-4000-8000-000000000602'), 2::bigint, 'clearing the mode is told as well');
select * from finish();
rollback;
