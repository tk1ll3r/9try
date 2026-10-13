-- Push notifications, made whole.
--
-- What was there: every notification is also a row in `reminders`, the queue of the push worker
-- (supabase/functions/process-reminders). The worker pushed each row once, did not notice when
-- every device refused, and nothing called it.
--
-- What this adds:
--  1. The queue is claimed and closed through two functions, so the rules live here and are tested
--     here: who may be pushed to, retries with a longer wait each time, addresses that a browser
--     gave up, and what each device answered last.
--  2. The database calls the worker itself: at once when a notification is written, and every
--     minute for what is scheduled. Both need two secrets in the vault; without them nothing is
--     called and notifications still reach the inbox.
--  3. More things are told: a pinned friend turns a mode on (for people who asked for that), an
--     event is shown to a friend or changes, and a confirmed meetup or an event is 30 minutes away.
--  4. A notification about a meetup opens that meetup.
--  5. A reminder is checked again when it is due. What was cancelled, moved or no longer shown to
--     the person is not sent.

-- 1. What is stored about a device, and two new choices.
alter table public.push_subscriptions
  add column label text check (label is null or length(label) <= 80),
  -- The language of the app on that device. A push is written in it.
  add column language text not null default 'vi' check (language in ('vi', 'en')),
  add column last_seen_at timestamptz not null default now(),
  add column last_success_at timestamptz,
  add column last_failure_at timestamptz,
  add column last_error text,
  add column failure_count integer not null default 0;

-- A private preview shows on the lock screen that something arrived, not what.
alter table public.notification_preferences add column private_previews boolean not null default false;
alter table public.reminders add column last_error text;

-- Whether a push may go to this person now: they turned push on, did not turn this kind off, and it
-- is not their quiet time. Alerts about a friend's mode are off until someone asks for them.
create function private.push_allowed(p_user_id uuid, p_category text) returns boolean
language plpgsql stable set search_path = '' as $$
declare pref public.notification_preferences%rowtype; zone text; local_now time;
begin
  select * into pref from public.notification_preferences where user_id = p_user_id;
  if pref.user_id is null or not pref.push_enabled then return false; end if;
  if not coalesce((pref.category_push->>p_category)::boolean, p_category <> 'friend_mode') then return false; end if;
  if pref.quiet_start is null or pref.quiet_end is null or pref.quiet_start = pref.quiet_end then return true; end if;

  select timezone into zone from public.profiles where id = p_user_id;
  local_now := (now() at time zone coalesce(zone, 'UTC'))::time;
  if pref.quiet_start < pref.quiet_end then return not (local_now >= pref.quiet_start and local_now < pref.quiet_end); end if;
  return not (local_now >= pref.quiet_start or local_now < pref.quiet_end);
end $$;

create or replace function public.can_send_push(p_user_id uuid, p_category text) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.push_allowed(p_user_id, p_category)
$$;

-- 2. Calling the worker. The address and the secret are in the vault under these two names:
--      select vault.create_secret('https://<project>.supabase.co/functions/v1/process-reminders', 'push_worker_url');
--      select vault.create_secret('<the CRON_SECRET of the function>', 'push_worker_secret');
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise warning 'pg_net is unavailable (%). The database then cannot call the push worker; an outside scheduler has to.', sqlerrm;
end $$;

create function private.kick_push_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare target text; secret text;
begin
  -- Once per transaction is enough: the worker takes everything that is due.
  if current_setting('gnouht.push_kicked', true) = '1' then return; end if;
  perform set_config('gnouht.push_kicked', '1', true);
  execute $q$select (select decrypted_secret from vault.decrypted_secrets where name = 'push_worker_url'),
                    (select decrypted_secret from vault.decrypted_secrets where name = 'push_worker_secret')$q$ into target, secret;
  if target is null or secret is null then return; end if;
  -- pg_net sends after the transaction has committed and does not wait for the answer.
  execute $q$select net.http_post(url := $1, body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || $2, 'Content-Type', 'application/json'))$q$ using target, secret;
exception when others then
  -- No vault, no pg_net or a bad address. The notification itself must still be saved.
  null;
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
  perform private.kick_push_worker();
  return null;
end $$;

do $$
begin
  perform cron.schedule('push-worker', '* * * * *', 'select private.kick_push_worker()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Scheduled reminders are then pushed only when something else calls the worker.', sqlerrm;
end $$;

-- Writes a notification, or brings an unread one about the same thing up to date, and puts its push
-- `p_delay` from now. Telling again within the delay moves the push back, so a burst is one push.
create function private.notify(p_user_id uuid, p_category text, p_title text, p_body text, p_action_path text, p_key text, p_delay interval default interval '0')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
  values (p_user_id, p_category, p_title, p_body, p_action_path, p_key)
  on conflict (dedupe_key) do update
    set title = excluded.title, body = excluded.body, action_path = excluded.action_path, read_at = null, created_at = now();
  insert into public.reminders(user_id, category, due_at, payload, idempotency_key)
  values (p_user_id, p_category, now() + p_delay, jsonb_build_object('title', p_title, 'body', p_body, 'action_path', p_action_path), p_key)
  on conflict (idempotency_key) do update
    set status = 'pending', attempts = 0, due_at = excluded.due_at, delivered_at = null, payload = excluded.payload, last_error = null;
  perform private.emit(p_user_id, 'notifications');
end $$;

-- 3a. A pinned friend turns a mode on. Only for people who turned this kind of alert on, and only
-- about friends they pinned. The text carries the key of the activity ("mode:coffee"); the app and
-- the worker know its name in each language. Changes within a minute are one alert.
create function private.after_activity_mode_alert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(new.user_id, old.user_id);
begin
  if tg_op = 'DELETE' then
    -- Turned off before the alert went out: there is nothing left to tell.
    delete from public.notifications n using public.reminders r
    where n.dedupe_key = r.idempotency_key and r.idempotency_key like 'mode:' || who::text || ':%' and r.status = 'pending';
    update public.reminders r set status = 'canceled'
    where r.idempotency_key like 'mode:' || who::text || ':%' and r.status = 'pending';
    return null;
  end if;
  -- The same mode, set again while it runs, is no news.
  if tg_op = 'UPDATE' and old.mode = new.mode and old.expires_at > now() then return null; end if;

  perform private.notify(p.user_id, 'friend_mode', private.display_name_of(who) || ' vừa bật mode', 'mode:' || new.mode, '/',
    'mode:' || who::text || ':' || p.user_id::text, interval '1 minute')
  from public.friend_pins p
  join public.notification_preferences pref on pref.user_id = p.user_id
  where p.friend_id = who
    and coalesce((pref.category_push->>'friend_mode')::boolean, false)
    and private.can_contact(who, p.user_id);
  return null;
end $$;

create trigger activity_modes_alert after insert or update or delete on public.activity_modes
for each row execute function private.after_activity_mode_alert();

-- 3b. Reminders 30 minutes before something starts.
create function private.forget_reminders(p_related_id uuid, p_user_id uuid default null) returns void
language sql set search_path = '' as $$
  update public.reminders r set status = 'canceled'
  where r.category = 'upcoming_event' and r.related_id = p_related_id and r.status = 'pending'
    and (p_user_id is null or r.user_id = p_user_id);
$$;

-- The key holds the start, so a new time is a new reminder and the one for the old time is dropped.
create function private.remind_before(p_user_id uuid, p_kind text, p_related_id uuid, p_title text, p_starts_at timestamptz, p_action_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare key text := p_kind || '-soon:' || p_related_id::text || ':' || p_user_id::text || ':' || extract(epoch from p_starts_at)::bigint::text; zone text;
begin
  update public.reminders r set status = 'canceled'
  where r.category = 'upcoming_event' and r.related_id = p_related_id and r.user_id = p_user_id and r.status = 'pending' and r.idempotency_key <> key;
  -- Less than half an hour away, or already begun: the person has just written it themselves.
  if p_starts_at - interval '30 minutes' <= now() then return; end if;

  select coalesce(p.timezone, 'UTC') into zone from public.profiles p where p.id = p_user_id;
  insert into public.reminders(user_id, category, related_id, due_at, payload, idempotency_key)
  values (p_user_id, 'upcoming_event', p_related_id, p_starts_at - interval '30 minutes',
    jsonb_build_object('kind', p_kind, 'starts_at', p_starts_at, 'title', 'Sắp diễn ra: ' || p_title,
      'body', 'Bắt đầu lúc ' || to_char(p_starts_at at time zone zone, 'HH24:MI'), 'action_path', p_action_path), key)
  on conflict (idempotency_key) do update set payload = excluded.payload, status = 'pending'
    where public.reminders.status in ('pending', 'canceled');
end $$;

-- A confirmed meetup: the organizer and everyone who did not decline.
create function private.after_meetup_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform private.forget_reminders(old.id); return null; end if;
  if new.status = 'confirmed' and new.start_at is not null then
    perform private.remind_before(going.user_id, 'meetup', new.id, new.title, new.start_at, '/meetups/' || new.id::text)
    from (
      select new.organizer_id as user_id
      union
      select i.user_id from public.meetup_invitees i where i.meetup_id = new.id and i.rsvp_status <> 'declined'
    ) going;
  else
    perform private.forget_reminders(new.id);
  end if;
  return null;
end $$;

create trigger meetups_remind after insert or update of status, start_at, title or delete on public.meetups
for each row execute function private.after_meetup_change();

create function private.after_meetup_invitee_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(new.user_id, old.user_id); mid uuid := coalesce(new.meetup_id, old.meetup_id); meetup public.meetups%rowtype;
begin
  select * into meetup from public.meetups m where m.id = mid;
  if tg_op <> 'DELETE' and new.rsvp_status <> 'declined' and meetup.status = 'confirmed' and meetup.start_at is not null then
    perform private.remind_before(who, 'meetup', mid, meetup.title, meetup.start_at, '/meetups/' || mid::text);
  else
    perform private.forget_reminders(mid, who);
  end if;
  return null;
end $$;

create trigger meetup_invitees_remind after insert or update of rsvp_status or delete on public.meetup_invitees
for each row execute function private.after_meetup_invitee_change();

-- An event of the calendar that happens once, at a time: its owner and the friends it is shown to.
-- ponytail: classes and other repeating events get no reminder, and members of a group an event is
-- shown to get none either. Both need the next time counted out for each person; add when asked for.
create function private.remind_event(p_event_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  select * into e from public.calendar_events c where c.id = p_event_id;
  if e.id is null or e.event_kind <> 'timed' or e.recurrence_rule is not null or coalesce(e.category, 'event') = 'class' then
    perform private.forget_reminders(p_event_id);
    return;
  end if;
  perform private.remind_before(e.owner_id, 'event', e.id, e.title, e.start_at, '/calendar');
  perform private.remind_before(s.user_id, 'event', e.id, e.title, e.start_at, '/calendar/shared/' || e.owner_id::text)
  from public.event_shares s
  where s.event_id = e.id and s.user_id is not null and e.visibility = 'selected_friends' and private.can_contact(e.owner_id, s.user_id);
  -- Someone the event is no longer shown to.
  update public.reminders r set status = 'canceled'
  where r.category = 'upcoming_event' and r.related_id = e.id and r.status = 'pending' and r.user_id <> e.owner_id
    and not (e.visibility = 'selected_friends' and exists(select 1 from public.event_shares s where s.event_id = e.id and s.user_id = r.user_id));
end $$;

-- 3c. An event is shown to a friend, or changes while it is shown.
create function private.after_calendar_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then perform private.forget_reminders(old.id); return null; end if;
  perform private.remind_event(new.id);
  -- A new name or time is told to the friends who see the event, once for a burst of changes.
  if tg_op = 'UPDATE' and new.visibility = 'selected_friends'
     and (new.title, new.start_at, new.end_at, new.all_day_start, new.all_day_end_exclusive)
       is distinct from (old.title, old.start_at, old.end_at, old.all_day_start, old.all_day_end_exclusive) then
    perform private.notify(s.user_id, 'event_changed', private.display_name_of(new.owner_id) || ' đã đổi một sự kiện', new.title,
      '/calendar/shared/' || new.owner_id::text, 'evchange:' || new.id::text || ':' || s.user_id::text, interval '1 minute')
    from public.event_shares s
    where s.event_id = new.id and s.user_id is not null and private.can_contact(new.owner_id, s.user_id);
  end if;
  return null;
end $$;

create trigger calendar_events_notify after insert or update or delete on public.calendar_events
for each row execute function private.after_calendar_event_change();

create function private.after_event_share_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.calendar_events%rowtype;
begin
  select * into e from public.calendar_events c where c.id = new.event_id;
  if new.user_id is not null and e.visibility = 'selected_friends' and new.user_id <> e.owner_id then
    -- Told once for each event, however often the owner saves the list of friends.
    insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
    values (new.user_id, 'event_shared', private.display_name_of(e.owner_id) || ' chia sẻ một sự kiện với bạn', e.title,
      '/calendar/shared/' || e.owner_id::text, 'evshare:' || new.event_id::text || ':' || new.user_id::text)
    on conflict (dedupe_key) do nothing;
  end if;
  perform private.remind_event(new.event_id);
  return null;
end $$;

create trigger event_shares_notify after insert on public.event_shares
for each row execute function private.after_event_share_insert();

-- Saving the list of friends deletes every row and writes the new list, so what a removal means is
-- known only at the end of the transaction: if the person is not on the list then, the event is no
-- longer shown to them, and what was said about it leaves their inbox, pushed or not.
create function private.after_event_share_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id is null or exists(select 1 from public.event_shares s where s.event_id = old.event_id and s.user_id = old.user_id) then return null; end if;
  delete from public.notifications n
  where n.dedupe_key in ('evshare:' || old.event_id::text || ':' || old.user_id::text, 'evchange:' || old.event_id::text || ':' || old.user_id::text);
  update public.reminders r set status = 'canceled'
  where r.idempotency_key in ('evshare:' || old.event_id::text || ':' || old.user_id::text, 'evchange:' || old.event_id::text || ':' || old.user_id::text)
    and r.status = 'pending';
  perform private.forget_reminders(old.event_id, old.user_id);
  perform private.emit(old.user_id, 'notifications');
  return null;
end $$;

create constraint trigger event_shares_removed after delete on public.event_shares
deferrable initially deferred for each row execute function private.after_event_share_removed();

-- 5. A reminder is looked at again when it is due.
create function private.reminder_is_current(r public.reminders) returns boolean
language sql stable set search_path = '' as $$
  select case
    when r.category <> 'upcoming_event' then true
    when r.payload->>'kind' = 'meetup' then exists(
      select 1 from public.meetups m
      where m.id = r.related_id and m.status = 'confirmed' and m.start_at = (r.payload->>'starts_at')::timestamptz
        and (m.organizer_id = r.user_id or exists(
          select 1 from public.meetup_invitees i where i.meetup_id = m.id and i.user_id = r.user_id and i.rsvp_status <> 'declined')))
    when r.payload->>'kind' = 'event' then exists(
      select 1 from public.calendar_events e
      where e.id = r.related_id and e.recurrence_rule is null and e.start_at = (r.payload->>'starts_at')::timestamptz
        and (e.owner_id = r.user_id or (
          e.visibility = 'selected_friends' and private.can_contact(e.owner_id, r.user_id)
          and exists(select 1 from public.event_shares s where s.event_id = e.id and s.user_id = r.user_id))))
    else true
  end
$$;

-- Puts due reminders into the inbox (migration 0030 did this for personal reminders). A reminder
-- about something that was cancelled, moved or taken away from the person is dropped instead, and
-- so is one that comes after the thing has begun.
create or replace function private.deliver_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare delivered integer;
begin
  update public.reminders r set status = 'canceled'
  where r.category = 'upcoming_event' and r.status = 'pending' and r.due_at <= now()
    and (r.due_at <= now() - interval '30 minutes' or not private.reminder_is_current(r));

  with added as (
    insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
    select r.user_id, r.category,
      coalesce(nullif(trim(r.payload->>'title'), ''), 'Nhắc việc'),
      coalesce(r.payload->>'body', 'Bạn có một việc sắp tới.'),
      coalesce(r.payload->>'action_path', '/notifications'),
      r.idempotency_key
    from public.reminders r
    where r.category in ('personal_reminder', 'upcoming_event')
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

-- 1. The worker's two calls.
-- Takes the queue entries that are due and marks them as being worked on. For each one: what to
-- say, where it leads, and the devices to send it to. The list of devices is empty when the person
-- has push off, has this kind off, is in their quiet time, or has read the notification already.
create function public.claim_push_batch(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare batch jsonb;
begin
  -- A worker that died mid-way left rows behind.
  update public.reminders set status = case when attempts >= 5 then 'failed' else 'pending' end, processing_started_at = null
  where status = 'processing' and processing_started_at < now() - interval '10 minutes';
  perform private.deliver_due_reminders();

  with due as (
    select r.id from public.reminders r
    where r.status = 'pending' and r.due_at <= now() and r.attempts < 5
    order by r.due_at
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
    for update skip locked
  ), claimed as (
    update public.reminders r set status = 'processing', processing_started_at = now(), attempts = r.attempts + 1
    from due where r.id = due.id
    returning r.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'category', c.category,
    'title', coalesce(n.title, nullif(c.payload->>'title', ''), 'Gnouht Together'),
    'body', coalesce(n.body, c.payload->>'body', ''),
    'url', coalesce(n.action_path, c.payload->>'action_path', '/notifications'),
    'tag', c.idempotency_key,
    'private', coalesce(pref.private_previews, false),
    'devices', case when n.read_at is null and private.push_allowed(c.user_id, c.category) then coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'language', s.language))
        from public.push_subscriptions s where s.user_id = c.user_id), '[]'::jsonb)
      else '[]'::jsonb end
  ) order by c.due_at), '[]'::jsonb) into batch
  from claimed c
  left join public.notifications n on n.dedupe_key = c.idempotency_key
  left join public.notification_preferences pref on pref.user_id = c.user_id;
  return batch;
end $$;

-- What each device answered: [{"device": id, "status": 201, "error": null}, …]. A 2xx is a success.
-- 404 and 410 mean the browser gave the address up, and the device is removed. Anything else is kept
-- with the device, for its owner to see. With `p_id`, the queue entry is closed: sent when a device
-- took it or there was nobody to send to, otherwise tried again after 2, 4, 8 and 16 minutes, then
-- given up.
create function public.finish_push(p_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare answer record; sent integer := 0; refused integer := 0; tries integer; problem text;
begin
  for answer in
    select (x->>'device')::uuid as device, coalesce((x->>'status')::integer, 0) as status, left(x->>'error', 200) as error
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) x
  loop
    if answer.status between 200 and 299 then
      update public.push_subscriptions set last_success_at = now(), last_error = null, failure_count = 0 where id = answer.device;
      sent := sent + 1;
    elsif answer.status in (404, 410) then
      delete from public.push_subscriptions where id = answer.device;
    else
      problem := coalesce(nullif(answer.error, ''), answer.status::text);
      update public.push_subscriptions set last_failure_at = now(), last_error = problem, failure_count = failure_count + 1 where id = answer.device;
      refused := refused + 1;
    end if;
  end loop;
  if p_id is null then return; end if;

  select r.attempts into tries from public.reminders r where r.id = p_id and r.status = 'processing' for update;
  if tries is null then return; end if;
  if sent > 0 or refused = 0 then
    update public.reminders set status = 'delivered', delivered_at = now(), processing_started_at = null, last_error = null where id = p_id;
  elsif tries >= 5 then
    update public.reminders set status = 'failed', processing_started_at = null, last_error = problem where id = p_id;
  else
    update public.reminders set status = 'pending', processing_started_at = null, last_error = problem,
      due_at = now() + make_interval(mins => (2 ^ tries)::integer) where id = p_id;
  end if;
end $$;

-- Only the worker, which holds the service key, may call these.
revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
revoke execute on function public.finish_push(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
grant execute on function public.finish_push(uuid, jsonb) to service_role;

-- 4. A notification about a meetup opens that meetup. These are the functions as they stood, with
-- '/meetups' replaced by the meetup's own address and nothing else changed.
create or replace function public.cancel_meetup(p_meetup_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare meetup_title text;
begin
  select title into meetup_title
  from public.meetups
  where id=p_meetup_id and organizer_id=auth.uid() and status<>'completed'
  for update;

  if meetup_title is null then raise exception 'organizer required'; end if;

  update public.meetups set status='canceled' where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Hoạt động đã hủy',meetup_title,'/meetups/'||p_meetup_id::text
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;

create or replace function public.confirm_meetup_time(p_meetup_id uuid, p_option_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s timestamptz; e timestamptz; meetup_title text;
begin
  select title into meetup_title from public.meetups where id=p_meetup_id and organizer_id=auth.uid();
  if meetup_title is null then raise exception 'organizer required'; end if;
  select starts_at,ends_at into s,e from public.meetup_time_options where id=p_option_id and meetup_id=p_meetup_id;
  if s is null then raise exception 'option not found'; end if;

  update public.meetups set start_at=s,end_at=e,status='confirmed' where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Đã chốt thời gian',meetup_title,'/meetups/'||p_meetup_id::text
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;

create or replace function public.create_meetup(p_group_id uuid, p_title text, p_description text, p_timezone text, p_capacity integer default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_group_id is not null and not public.is_group_member(p_group_id, auth.uid()) then raise exception 'group membership required'; end if;
  if p_capacity is not null and p_capacity < 1 then raise exception 'invalid capacity'; end if;

  insert into public.meetups(group_id, organizer_id, title, description, status, timezone, capacity)
  values (p_group_id, auth.uid(), trim(p_title), coalesce(p_description, ''), 'proposed', p_timezone, p_capacity)
  returning id into mid;

  insert into public.meetup_invitees(meetup_id, user_id, rsvp_status, responded_at)
  values (mid, auth.uid(), 'going', now());

  if p_group_id is not null then
    insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
    select mid, m.user_id, 'pending'
    from public.group_memberships m
    where m.group_id = p_group_id and m.user_id <> auth.uid()
      and not private.is_blocked_between(auth.uid(), m.user_id);

    insert into public.notifications(user_id, category, title, body, action_path)
    select i.user_id, 'meetup_invite', 'Lời mời hoạt động', trim(p_title), '/meetups/' || mid::text
    from public.meetup_invitees i
    where i.meetup_id = mid and i.user_id <> auth.uid();
  end if;

  return mid;
end $$;

create or replace function public.invite_to_meetup(p_meetup_id uuid, p_username text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; meetup_title text; meetup_group uuid;
begin
  select m.title, m.group_id into meetup_title, meetup_group
  from public.meetups m
  where m.id = p_meetup_id and m.organizer_id = auth.uid();
  if meetup_title is null then raise exception 'organizer required'; end if;

  select p.id into target
  from public.profiles p
  where p.username is not null and lower(p.username) = lower(trim(p_username)) and p.id <> auth.uid()
  limit 1;
  if target is null then raise exception 'user not found'; end if;

  if private.is_blocked_between(auth.uid(), target)
     or not (private.are_friends(auth.uid(), target)
             or (meetup_group is not null and public.is_group_member(meetup_group, target)))
  then raise exception 'invite unavailable'; end if;

  insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
  values (p_meetup_id, target, 'pending')
  on conflict do nothing;

  -- Inviting the same person again does not notify them again.
  if found then
    insert into public.notifications(user_id, category, title, body, action_path)
    values (target, 'meetup_invite', 'Lời mời hoạt động', meetup_title, '/meetups/' || p_meetup_id::text);
  end if;

  return target;
end $$;

create or replace function public.invite_users_to_meetup(p_meetup_id uuid, p_user_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare meetup_title text; meetup_group uuid; invited integer;
begin
  select m.title, m.group_id into meetup_title, meetup_group
  from public.meetups m
  where m.id = p_meetup_id and m.organizer_id = auth.uid() and m.status not in ('canceled', 'completed');
  if meetup_title is null then raise exception 'organizer required'; end if;

  with added as (
    insert into public.meetup_invitees(meetup_id, user_id, rsvp_status)
    select p_meetup_id, p.id, 'pending'
    from public.profiles p
    where p.id = any(p_user_ids) and p.id <> auth.uid()
      and not private.is_blocked_between(auth.uid(), p.id)
      and (private.are_friends(auth.uid(), p.id)
        or (meetup_group is not null and public.is_group_member(meetup_group, p.id)))
    on conflict do nothing
    returning user_id
  ), told as (
    insert into public.notifications(user_id, category, title, body, action_path)
    select a.user_id, 'meetup_invite', 'Lời mời hoạt động', meetup_title, '/meetups/' || p_meetup_id::text from added a
    returning 1
  )
  select count(*) into invited from told;
  return invited;
end $$;

create or replace function public.respond_meetup_rsvp(p_meetup_id uuid, p_response text) returns void
language plpgsql security definer set search_path = public as $$
declare cap integer; mstatus public.meetup_status; current_rsvp public.rsvp_status; going_count integer; organizer uuid; meetup_title text;
begin
  if p_response not in ('going','maybe','declined') then raise exception 'invalid response'; end if;

  select capacity,status,organizer_id,title into cap,mstatus,organizer,meetup_title
  from public.meetups where id=p_meetup_id for update;
  if mstatus is null then raise exception 'meetup not found'; end if;
  if mstatus in ('canceled','completed') then raise exception 'meetup closed'; end if;

  select rsvp_status into current_rsvp
  from public.meetup_invitees where meetup_id=p_meetup_id and user_id=auth.uid()
  for update;
  if current_rsvp is null then raise exception 'not invited'; end if;

  if p_response='going' and current_rsvp<>'going' and cap is not null then
    select count(*) into going_count from public.meetup_invitees where meetup_id=p_meetup_id and rsvp_status='going';
    if going_count>=cap then raise exception 'capacity reached'; end if;
  end if;

  update public.meetup_invitees
  set rsvp_status=p_response::public.rsvp_status,responded_at=now()
  where meetup_id=p_meetup_id and user_id=auth.uid();

  if organizer<>auth.uid() then
    insert into public.notifications(user_id,category,title,body,action_path)
    values(organizer,'rsvp_update','Cập nhật tham gia',meetup_title,'/meetups/'||p_meetup_id::text);
  end if;
end $$;

create or replace function public.update_meetup_details(
  p_meetup_id uuid, p_title text, p_description text,
  p_location_name text default null, p_meeting_url text default null, p_capacity integer default null
) returns void
language plpgsql security definer set search_path = public as $$
declare old_title text;
begin
  select title into old_title
  from public.meetups
  where id=p_meetup_id
    and organizer_id=auth.uid()
    and status not in ('canceled','completed')
  for update;

  if old_title is null then raise exception 'organizer required'; end if;
  if length(trim(p_title))<1 or length(trim(p_title))>160 then raise exception 'invalid title'; end if;
  if p_capacity is not null and p_capacity<1 then raise exception 'invalid capacity'; end if;

  update public.meetups
  set title=trim(p_title),
      description=coalesce(p_description,''),
      location_name=nullif(trim(coalesce(p_location_name,'')),''),
      meeting_url=nullif(trim(coalesce(p_meeting_url,'')),''),
      capacity=p_capacity
  where id=p_meetup_id;

  insert into public.notifications(user_id,category,title,body,action_path)
  select i.user_id,'meetup_change','Hoạt động có thay đổi',trim(p_title),'/meetups/'||p_meetup_id::text
  from public.meetup_invitees i
  where i.meetup_id=p_meetup_id and i.user_id<>auth.uid();
end $$;
