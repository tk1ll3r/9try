-- Disposable local Supabase Postgres ONLY. No cloud-linked reset or production use.
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000201','00000000-0000-0000-0000-000000000000','authenticated','authenticated','weekly-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000202','00000000-0000-0000-0000-000000000000','authenticated','authenticated','weekly-other@example.invalid');
update public.profiles set timezone='Asia/Ho_Chi_Minh' where id='00000000-0000-4000-8000-000000000201';
insert into public.personal_tasks(id,owner_id,title,recurrence) values
  ('00000000-0000-4000-8000-000000000211','00000000-0000-4000-8000-000000000201','Once weekly','weekly'),
  ('00000000-0000-4000-8000-000000000212','00000000-0000-4000-8000-000000000201','Every day','daily');

-- Prior Sunday is outside this Monday-start week and must not count as done.
insert into public.routine_completions(task_id,completion_date)
values ('00000000-0000-4000-8000-000000000211', date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date-1);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is(public.complete_routine('00000000-0000-4000-8000-000000000211'), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'weekly task records current profile-local day');
select is((select count(*) from public.routine_completions where task_id='00000000-0000-4000-8000-000000000211'), 2::bigint, 'previous week completion does not prevent current week');
select is(public.complete_routine('00000000-0000-4000-8000-000000000211'), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'weekly duplicate returns existing date');
select is((select count(*) from public.routine_completions where task_id='00000000-0000-4000-8000-000000000211'), 2::bigint, 'weekly duplicate does not write again');
select is(public.complete_routine('00000000-0000-4000-8000-000000000212'), (now() at time zone 'Asia/Ho_Chi_Minh')::date, 'daily task still records profile-local day');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000202',true);
select throws_ok($$select public.complete_routine('00000000-0000-4000-8000-000000000211')$$, 'P0001', 'routine not found', 'other user cannot complete owner routine');
reset role;
-- Simulate an existing completion earlier in this week: next call returns that date, even if not today.
delete from public.routine_completions where task_id='00000000-0000-4000-8000-000000000211'
  and completion_date=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
insert into public.routine_completions(task_id,completion_date)
values ('00000000-0000-4000-8000-000000000211', date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date)
on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000201',true);
select is(public.complete_routine('00000000-0000-4000-8000-000000000211'), date_trunc('week',(now() at time zone 'Asia/Ho_Chi_Minh')::timestamp)::date, 'once-per-week returns existing Monday completion');
reset role;
select * from finish();
rollback;
