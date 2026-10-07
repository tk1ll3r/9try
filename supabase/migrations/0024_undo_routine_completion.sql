-- Lets the owner take back a habit completion of the running period: today for a daily habit,
-- this Monday-start week for a weekly one, both on the profile's calendar. Earlier periods stay.
create function public.undo_routine_completion(p_task_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  kind text;
  local_day date;
begin
  select t.recurrence into kind
  from public.personal_tasks t
  where t.id = p_task_id and t.owner_id = (select auth.uid()) and t.recurrence in ('daily', 'weekly')
  for update;
  if not found then raise exception 'routine not found'; end if;

  local_day := (now() at time zone coalesce((select p.timezone from public.profiles p where p.id = (select auth.uid())), 'UTC'))::date;

  delete from public.routine_completions rc
  where rc.task_id = p_task_id
    and rc.completion_date <= local_day
    and rc.completion_date >= case when kind = 'weekly' then date_trunc('week', local_day::timestamp)::date else local_day end;
end $$;

revoke execute on function public.undo_routine_completion(uuid) from public, anon;
grant execute on function public.undo_routine_completion(uuid) to authenticated;
