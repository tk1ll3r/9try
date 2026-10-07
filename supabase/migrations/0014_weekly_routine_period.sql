-- A weekly routine records at most one completion per Monday-start profile-local week.
-- Lock its owning task so two concurrent requests cannot insert different dates in the same week.
-- Existing completions remain intact; do not rewrite earlier daily records.
create or replace function public.complete_routine(p_task_id uuid) returns date
language plpgsql security definer set search_path=public as $$
declare
  tz text;
  local_day date;
  week_start date;
  routine_kind text;
  previous_completion date;
begin
  if auth.uid() is null then raise exception 'routine not found'; end if;

  select t.recurrence into routine_kind
  from public.personal_tasks t
  where t.id=p_task_id and t.owner_id=auth.uid() and t.recurrence in ('daily','weekly')
  for update;
  if not found then raise exception 'routine not found'; end if;

  select coalesce(p.timezone,'UTC') into tz from public.profiles p where p.id=auth.uid();
  local_day := (now() at time zone coalesce(tz,'UTC'))::date;

  if routine_kind='weekly' then
    week_start := date_trunc('week',local_day::timestamp)::date; -- ISO Monday, profile-local
    select rc.completion_date into previous_completion
    from public.routine_completions rc
    where rc.task_id=p_task_id and rc.completion_date between week_start and local_day
    order by rc.completion_date limit 1;
    if found then return previous_completion; end if;
  end if;

  insert into public.routine_completions(task_id,completion_date)
  values(p_task_id,local_day)
  on conflict do nothing;
  return local_day;
end $$;
