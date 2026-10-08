-- A personal reminder ("Nhắc việc") became a notification only when the reminder worker ran:
-- supabase/functions/process-reminders, called every minute by a scheduler that knows a secret.
-- Where that worker is not deployed, a reminder was stored and never arrived.
--
-- The database now puts a due reminder into the inbox itself, once a minute, through pg_cron.
-- The worker is still what sends the push. The notification trigger of migration 0017 keeps the
-- queue entry pending; the worker then finds the notification by the same key and adds no second.

create or replace function private.deliver_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare delivered integer;
begin
  with added as (
    -- The same title, text and target as the worker writes.
    insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
    select r.user_id, r.category,
      coalesce(nullif(trim(r.payload->>'title'), ''), 'Nhắc việc'),
      coalesce(r.payload->>'body', 'Bạn có một việc sắp tới.'),
      coalesce(r.payload->>'action_path', '/notifications'),
      r.idempotency_key
    from public.reminders r
    where r.category = 'personal_reminder'
      and r.status in ('pending', 'processing')
      -- This runs every minute. After an outage, a reminder more than a day late is not sent at all.
      and r.due_at <= now() and r.due_at > now() - interval '1 day'
      and not exists (select 1 from public.notifications n where n.dedupe_key = r.idempotency_key)
    order by r.due_at
    limit 500
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into delivered from added;
  return delivered;
end $$;

revoke all on function private.deliver_due_reminders() from public;

-- Where no worker runs, queue entries stay pending for ever: one for each notification. A push that
-- is a week late is of no use to anyone, so those go as well.
create or replace function private.purge_old_records() returns void
language sql set search_path = '' as $$
  delete from public.reminders
  where status in ('delivered', 'failed', 'canceled') and coalesce(delivered_at, due_at) < now() - interval '30 days';
  delete from public.reminders
  where status in ('pending', 'processing') and due_at < now() - interval '7 days';
  delete from public.notifications
  where read_at is not null and read_at < now() - interval '90 days';
$$;

do $$
begin
  perform cron.schedule('deliver-due-reminders', '* * * * *', 'select private.deliver_due_reminders()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Personal reminders then reach the inbox only through the reminder worker.', sqlerrm;
end $$;
