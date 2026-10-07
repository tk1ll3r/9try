-- Realtime: one private topic per user, "user:<id>". Only the database writes to it, so who
-- receives an event is decided when the event is sent. The app treats each event as a hint
-- to reload the data named by the event; the data itself still comes through RLS.
--
-- Push: every notification is also queued for the reminder worker
-- (supabase/functions/process-reminders), which already sends Web Push with the user's
-- preferences and quiet hours. Until now only personal reminders were pushed.

create or replace function private.emit(p_user_id uuid, p_event text, p_payload jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(p_payload, p_event, 'user:' || p_user_id::text, true);
exception when others then
  -- A realtime problem must never undo the change that caused the event.
  raise warning 'realtime event % was not sent: %', p_event, sqlerrm;
end $$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    drop policy if exists "users listen to their own topic" on realtime.messages;
    create policy "users listen to their own topic" on realtime.messages
      for select to authenticated
      using ((select realtime.topic()) = 'user:' || (select auth.uid())::text);
  end if;
end $$;

-- The worker upserts a notification by dedupe_key. Giving every notification a key and using
-- the same key for its queue entry means the worker finds the row instead of adding a second.
create or replace function private.before_notification_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.dedupe_key is null then new.dedupe_key := 'n:' || new.id::text; end if;
  return new;
end $$;

create or replace function private.after_notification_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- A notification written by the worker belongs to a reminder it is processing right now.
  if not exists(select 1 from public.reminders r where r.idempotency_key = new.dedupe_key and r.status = 'processing') then
    insert into public.reminders(user_id, category, due_at, payload, idempotency_key)
    values (new.user_id, new.category, now(),
      jsonb_build_object('title', new.title, 'body', new.body, 'action_path', new.action_path), new.dedupe_key)
    on conflict (idempotency_key) do update
      set status = 'pending', attempts = 0, due_at = now(), delivered_at = null, payload = excluded.payload;
  end if;
  perform private.emit(new.user_id, 'notifications');
  return null;
end $$;

drop trigger if exists notifications_before_insert on public.notifications;
create trigger notifications_before_insert before insert on public.notifications
for each row execute function private.before_notification_insert();

drop trigger if exists notifications_after_insert on public.notifications;
create trigger notifications_after_insert after insert on public.notifications
for each row execute function private.after_notification_insert();

-- Finished queue entries and old read notifications do not need to be kept.
create or replace function private.purge_old_records() returns void
language sql set search_path = '' as $$
  delete from public.reminders
  where status in ('delivered', 'failed', 'canceled') and coalesce(delivered_at, due_at) < now() - interval '30 days';
  delete from public.notifications
  where read_at is not null and read_at < now() - interval '90 days';
$$;

do $$
begin
  perform cron.schedule('purge-old-records', '17 3 * * *', 'select private.purge_old_records()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Old reminders and read notifications are not purged.', sqlerrm;
end $$;
