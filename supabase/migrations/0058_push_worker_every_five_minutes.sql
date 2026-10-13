-- A new notification already calls the push worker. The every-minute job only caught a worker that
-- had died, and it spent a disk read on an empty queue. Five minutes still picks that work up.
-- Reminders stay on the minute.
do $$
declare job bigint;
begin
  -- The embedded test database records jobs and has no unschedule. Production pg_cron does.
  -- schedule() replaces a job of the same name in the test stand-in.
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'cron' and p.proname = 'unschedule') then
    for job in select j.jobid from cron.job j where j.jobname = 'push-worker' loop
      perform cron.unschedule(job);
    end loop;
  end if;
  perform cron.schedule('push-worker', '*/5 * * * *', 'select private.kick_push_worker()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Scheduled reminders are then pushed only when something else calls the worker.', sqlerrm;
end $$;
