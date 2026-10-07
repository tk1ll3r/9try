-- Disposable local Supabase Postgres ONLY. No cloud-linked reset or production use.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000301','00000000-0000-0000-0000-000000000000','authenticated','authenticated','habit-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000302','00000000-0000-0000-0000-000000000000','authenticated','authenticated','habit-other@example.invalid');
update public.profiles set timezone='Asia/Ho_Chi_Minh' where id='00000000-0000-4000-8000-000000000301';
insert into public.personal_tasks(id,owner_id,title,recurrence) values
  ('00000000-0000-4000-8000-000000000311','00000000-0000-4000-8000-000000000301','Walk','daily'),
  ('00000000-0000-4000-8000-000000000312','00000000-0000-4000-8000-000000000301','Read','weekly'),
  ('00000000-0000-4000-8000-000000000313','00000000-0000-4000-8000-000000000301','Buy milk','none');

-- Yesterday for the daily habit; last week (Sunday) and this week (Monday) for the weekly one.
insert into public.routine_completions(task_id,completion_date) values
  ('00000000-0000-4000-8000-000000000311', (now() at time zone 'Asia/Ho_Chi_Minh')::date - 1),
  ('00000000-0000-4000-8000-000000000312', date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date - 1),
  ('00000000-0000-4000-8000-000000000312', date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000301',true);
select public.complete_routine('00000000-0000-4000-8000-000000000311');
select lives_ok($$select public.undo_routine_completion('00000000-0000-4000-8000-000000000311')$$, 'owner takes back today');
select is((select array_agg(completion_date) from public.routine_completions where task_id='00000000-0000-4000-8000-000000000311'),
  array[(now() at time zone 'Asia/Ho_Chi_Minh')::date - 1], 'only today is removed; yesterday stays');
select lives_ok($$select public.undo_routine_completion('00000000-0000-4000-8000-000000000312')$$, 'owner takes back this week');
select is((select array_agg(completion_date) from public.routine_completions where task_id='00000000-0000-4000-8000-000000000312'),
  array[date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date - 1], 'a weekly undo removes this week''s completion even from an earlier day; last week stays');
select throws_ok($$select public.undo_routine_completion('00000000-0000-4000-8000-000000000313')$$, 'P0001', 'routine not found', 'a one-off task is not a habit');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000302',true);
select throws_ok($$select public.undo_routine_completion('00000000-0000-4000-8000-000000000311')$$, 'P0001', 'routine not found', 'another user cannot undo');
reset role;
select is((select count(*) from public.routine_completions where task_id='00000000-0000-4000-8000-000000000311'), 1::bigint, 'the failed call changed nothing');
select * from finish();
rollback;
