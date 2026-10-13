-- Asking a friend to see their schedule.
--
-- Until now a person could only offer their busy times themselves, or show single events. Now a
-- friend can ask. The owner answers: no, or yes with three choices: busy times only (the default) or
-- event names as well, which days, and how long the permission lasts. Nothing is readable before the
-- owner says yes, and the owner can take the permission back at any moment.
--
-- A request is pending, accepted, declined, cancelled (by the one who asked) or expired (nobody
-- answered for 14 days). A grant is one row per owner and viewer; a new answer replaces the old one.

create table public.schedule_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  message text not null default '' check (length(message) <= 200),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  check (requester_id <> owner_id)
);
-- One open question per pair and direction.
create unique index schedule_requests_one_pending on public.schedule_requests(requester_id, owner_id) where status = 'pending';
create index schedule_requests_by_owner on public.schedule_requests(owner_id, status);

create table public.schedule_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.schedule_requests(id) on delete set null,
  -- 'busy': when the owner is busy. 'details': also what each event is called.
  detail text not null default 'busy' check (detail in ('busy', 'details')),
  -- The days that may be seen, on the owner's clock, both included.
  starts_on date not null,
  ends_on date not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, viewer_id),
  check (owner_id <> viewer_id),
  check (ends_on >= starts_on and ends_on <= starts_on + 180)
);
create index schedule_grants_by_viewer on public.schedule_grants(viewer_id);

-- No policies: both tables are read and changed only through the functions below.
alter table public.schedule_requests enable row level security;
alter table public.schedule_grants enable row level security;
revoke all on public.schedule_requests, public.schedule_grants from anon, authenticated;

create function private.display_name_of(p_user_id uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') from public.profiles p where p.id = p_user_id
$$;

-- Asks a friend. Refused while a question to the same person is open, for a week after they said
-- no, and after twenty questions in a day.
create function public.request_schedule(p_owner_id uuid, p_message text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); rid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not private.can_contact(me, p_owner_id) then raise exception 'request unavailable'; end if;

  update public.schedule_requests set status = 'expired'
  where requester_id = me and owner_id = p_owner_id and status = 'pending' and expires_at <= now();
  if exists(select 1 from public.schedule_requests r where r.requester_id = me and r.owner_id = p_owner_id and r.status = 'pending') then
    raise exception 'request already sent';
  end if;
  if exists(select 1 from public.schedule_requests r
            where r.requester_id = me and r.owner_id = p_owner_id and r.status = 'declined' and r.responded_at > now() - interval '7 days') then
    raise exception 'request too soon';
  end if;
  if (select count(*) from public.schedule_requests r where r.requester_id = me and r.created_at > now() - interval '1 day') >= 20 then
    raise exception 'too many requests';
  end if;

  insert into public.schedule_requests(requester_id, owner_id, message)
  values (me, p_owner_id, left(trim(coalesce(p_message, '')), 200)) returning id into rid;

  insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
  values (p_owner_id, 'schedule_request', private.display_name_of(me) || ' muốn xem lịch của bạn',
    'Bạn chọn chia sẻ lúc bận, cả tên sự kiện, hoặc từ chối.', '/calendar/requests', 'schedreq:' || rid::text)
  on conflict (dedupe_key) do nothing;

  perform private.emit(p_owner_id, 'calendar');
  perform private.emit(me, 'calendar');
  return rid;
end $$;

create function public.cancel_schedule_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); asked uuid;
begin
  update public.schedule_requests set status = 'cancelled', responded_at = now()
  where id = p_request_id and requester_id = me and status = 'pending'
  returning owner_id into asked;
  if asked is null then raise exception 'request not found'; end if;
  -- The owner has nothing left to answer.
  delete from public.notifications n where n.dedupe_key = 'schedreq:' || p_request_id::text;
  update public.reminders r set status = 'canceled' where r.idempotency_key = 'schedreq:' || p_request_id::text and r.status = 'pending';
  perform private.emit(asked, 'calendar');
  perform private.emit(asked, 'notifications');
  perform private.emit(me, 'calendar');
end $$;

-- The owner's answer. A yes writes the grant; nothing can be read before that. Without other
-- choices a yes means: busy times only, two weeks from today, for seven days.
create function public.respond_schedule_request(
  p_request_id uuid,
  p_accept boolean,
  p_detail text default 'busy',
  p_starts_on date default null,
  p_ends_on date default null,
  p_expires_in_days integer default 7
) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); asked public.schedule_requests%rowtype; today date; first_day date; last_day date;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into asked from public.schedule_requests r where r.id = p_request_id and r.owner_id = me for update;
  if asked.id is null or asked.status <> 'pending' or asked.expires_at <= now() then raise exception 'request not found'; end if;

  -- The two are no longer friends: there is nobody to answer.
  if not private.can_contact(me, asked.requester_id) then
    update public.schedule_requests set status = 'cancelled', responded_at = now() where id = p_request_id;
    return;
  end if;

  if p_accept then
    select (now() at time zone coalesce(p.timezone, 'UTC'))::date into today from public.profiles p where p.id = me;
    first_day := coalesce(p_starts_on, today);
    last_day := coalesce(p_ends_on, first_day + 13);
    if coalesce(p_detail, '') not in ('busy', 'details') or last_day < first_day or last_day > first_day + 180
       or last_day < today or coalesce(p_expires_in_days, 0) not between 1 and 90 then
      raise exception 'invalid sharing choice';
    end if;
    insert into public.schedule_grants(owner_id, viewer_id, request_id, detail, starts_on, ends_on, expires_at)
    values (me, asked.requester_id, p_request_id, p_detail, first_day, last_day, now() + make_interval(days => p_expires_in_days))
    on conflict (owner_id, viewer_id) do update set
      request_id = excluded.request_id, detail = excluded.detail, starts_on = excluded.starts_on,
      ends_on = excluded.ends_on, expires_at = excluded.expires_at, created_at = now();
  end if;

  update public.schedule_requests set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
  where id = p_request_id;
  -- The question is answered, so it no longer waits in the owner's inbox.
  update public.notifications n set read_at = now() where n.dedupe_key = 'schedreq:' || p_request_id::text and n.read_at is null;
  update public.reminders r set status = 'canceled' where r.idempotency_key = 'schedreq:' || p_request_id::text and r.status = 'pending';

  insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
  values (asked.requester_id, 'schedule_response',
    private.display_name_of(me) || case when p_accept then ' đã chia sẻ lịch với bạn' else ' chưa chia sẻ lịch với bạn' end,
    case when p_accept then 'Mở để xem lịch trong những ngày được chia sẻ.' else 'Bạn có thể hỏi lại sau một tuần.' end,
    case when p_accept then '/calendar/shared/' || me::text else '/calendar/requests' end,
    'schedres:' || p_request_id::text)
  on conflict (dedupe_key) do nothing;

  perform private.emit(asked.requester_id, 'calendar');
  perform private.emit(me, 'calendar');
  perform private.emit(me, 'notifications');
end $$;

-- Takes the permission back. The viewer's screen is told to reload, and the next read is refused.
create function public.revoke_schedule_grant(p_viewer_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.schedule_grants where owner_id = me and viewer_id = p_viewer_id;
  perform private.emit(p_viewer_id, 'calendar');
  perform private.emit(me, 'calendar');
end $$;

-- The questions the caller asked and was asked, in the last 60 days, newest first.
create function public.list_schedule_requests()
returns table(id uuid, direction text, user_id uuid, display_name text, username text, avatar_url text,
  status text, message text, created_at timestamptz, responded_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, case when r.owner_id = (select auth.uid()) then 'incoming' else 'outgoing' end,
    p.id, p.display_name, p.username, p.avatar_url,
    case when r.status = 'pending' and r.expires_at <= now() then 'expired' else r.status end,
    r.message,
    r.created_at, r.responded_at, r.expires_at
  from public.schedule_requests r
  join public.profiles p on p.id = case when r.owner_id = (select auth.uid()) then r.requester_id else r.owner_id end
  where (select auth.uid()) in (r.owner_id, r.requester_id)
    and r.created_at > now() - interval '60 days'
    and not private.is_blocked_between((select auth.uid()), p.id)
  order by r.created_at desc
  limit 100
$$;

-- The permissions that hold right now: the ones the caller gave ('given') and got ('received').
create function public.list_schedule_grants()
returns table(direction text, user_id uuid, display_name text, username text, avatar_url text,
  detail text, starts_on date, ends_on date, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select case when g.owner_id = (select auth.uid()) then 'given' else 'received' end,
    p.id, p.display_name, p.username, p.avatar_url, g.detail, g.starts_on, g.ends_on, g.expires_at
  from public.schedule_grants g
  join public.profiles p on p.id = case when g.owner_id = (select auth.uid()) then g.viewer_id else g.owner_id end
  where (select auth.uid()) in (g.owner_id, g.viewer_id)
    and g.expires_at > now()
    and private.can_contact(g.owner_id, g.viewer_id)
  order by g.created_at desc
$$;

-- What a grant lets the caller see of the owner's schedule between two instants: one row for each
-- time something happens, never outside the granted days. Repeating events are counted out here, on
-- the server, because a rule sent to the device would also tell what happens on the other days.
-- The name of an event comes only with a grant for details. Places and notes are never sent.
create function public.list_granted_schedule(p_owner_id uuid, p_from timestamptz, p_to timestamptz)
returns table(event_id uuid, occurrence_date date, title text, all_day boolean,
  starts_at timestamptz, ends_at timestamptz, first_day date, end_day_exclusive date, category text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare me uuid := (select auth.uid()); allowed public.schedule_grants%rowtype; zone text; w_from timestamptz; w_to timestamptz;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_to <= p_from or p_to > p_from + interval '180 days' then raise exception 'invalid range'; end if;
  select * into allowed from public.schedule_grants g where g.owner_id = p_owner_id and g.viewer_id = me and g.expires_at > now();
  if allowed.id is null or not private.can_contact(p_owner_id, me) then raise exception 'schedule not shared'; end if;

  select coalesce(p.timezone, 'UTC') into zone from public.profiles p where p.id = p_owner_id;
  w_from := greatest(p_from, allowed.starts_on::timestamp at time zone zone);
  w_to := least(p_to, (allowed.ends_on + 1)::timestamp at time zone zone);
  if w_to <= w_from then return; end if;

  return query
  with steps as (
    -- The n-th time an event happens is counted from the first one, so a monthly event on the 31st
    -- lands on the last day of a short month and returns to the 31st, as the app counts it.
    select e.id, n.i,
      make_interval(months => case when e.recurrence_rule = 'monthly' then n.i else 0 end,
                    days => case e.recurrence_rule when 'daily' then n.i when 'weekly' then 7 * n.i else 0 end) as step
    from public.calendar_events e
    cross join lateral (
      select coalesce(e.all_day_start, (e.start_at at time zone e.timezone)::date) as first_date,
        -- A time that was moved by hand may belong to a date after the window.
        greatest((w_to at time zone zone)::date, coalesce((select max(x.occurrence_date) from public.calendar_event_exceptions x where x.event_id = e.id), '-infinity'::date)) as last_date
    ) span
    cross join lateral generate_series(0, case
      when e.recurrence_rule is null or span.last_date < span.first_date then 0
      when e.recurrence_rule = 'daily' then least(span.last_date - span.first_date, 2000)
      when e.recurrence_rule = 'weekly' then least((span.last_date - span.first_date) / 7, 2000)
      else least((extract(year from span.last_date)::int - extract(year from span.first_date)::int) * 12
        + extract(month from span.last_date)::int - extract(month from span.first_date)::int, 2000)
    end) as n(i)
    where e.owner_id = p_owner_id
  ), timed as (
    select e.id as event_id, e.title, e.category, e.recurrence_until,
      ((e.start_at at time zone e.timezone) + s.step)::date as occurrence_date,
      ((e.start_at at time zone e.timezone) + s.step) at time zone e.timezone as starts_at,
      (((e.start_at at time zone e.timezone) + s.step) at time zone e.timezone) + (e.end_at - e.start_at) as ends_at
    from public.calendar_events e join steps s on s.id = e.id
    where e.event_kind = 'timed'
  ), whole_days as (
    select e.id as event_id, e.title, e.category, e.recurrence_until,
      (e.all_day_start + s.step)::date as occurrence_date,
      (e.all_day_start + s.step)::date + (e.all_day_end_exclusive - e.all_day_start) as end_day_exclusive
    from public.calendar_events e join steps s on s.id = e.id
    where e.event_kind = 'all_day'
  ), found as (
    select t.event_id, t.occurrence_date, coalesce(x.override_title, t.title) as title, false as all_day,
      coalesce(x.override_start_at, t.starts_at) as starts_at, coalesce(x.override_end_at, t.ends_at) as ends_at,
      null::date as first_day, null::date as end_day_exclusive, t.category
    from timed t
    left join public.calendar_event_exceptions x on x.event_id = t.event_id and x.occurrence_date = t.occurrence_date
    where (t.recurrence_until is null or t.occurrence_date <= t.recurrence_until) and not coalesce(x.canceled, false)
    union all
    select d.event_id, d.occurrence_date, coalesce(x.override_title, d.title), true,
      null::timestamptz, null::timestamptz,
      coalesce(x.override_all_day_start, d.occurrence_date), coalesce(x.override_all_day_end_exclusive, d.end_day_exclusive), d.category
    from whole_days d
    left join public.calendar_event_exceptions x on x.event_id = d.event_id and x.occurrence_date = d.occurrence_date
    where (d.recurrence_until is null or d.occurrence_date <= d.recurrence_until) and not coalesce(x.canceled, false)
  )
  select f.event_id, f.occurrence_date, case when allowed.detail = 'details' then f.title end, f.all_day,
    f.starts_at, f.ends_at, f.first_day, f.end_day_exclusive, coalesce(f.category, 'event')
  from found f
  where (not f.all_day and f.starts_at < w_to and f.ends_at > w_from)
     or (f.all_day and f.first_day::timestamp at time zone zone < w_to and f.end_day_exclusive::timestamp at time zone zone > w_from)
  order by coalesce(f.starts_at, f.first_day::timestamp at time zone zone);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.request_schedule(uuid, text)', 'public.cancel_schedule_request(uuid)',
    'public.respond_schedule_request(uuid, boolean, text, date, date, integer)', 'public.revoke_schedule_grant(uuid)',
    'public.list_schedule_requests()', 'public.list_schedule_grants()',
    'public.list_granted_schedule(uuid, timestamptz, timestamptz)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Unfriending or blocking ends what the two shared (migrations 0015, 0028 and 0033). A permission to
-- see the schedule ends too, an open question between the two is withdrawn, and both calendars reload.
create or replace function private.revoke_relationship_grants(a uuid, b uuid) returns void
language sql set search_path = '' as $$
  delete from public.availability_shares s
  where (s.owner_id = a and s.user_id = b) or (s.owner_id = b and s.user_id = a);

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id = s.id
    and ((s.owner_id = a and r.user_id = b) or (s.owner_id = b and r.user_id = a));

  delete from public.event_shares e
  using public.calendar_events c
  where e.event_id = c.id
    and ((c.owner_id = a and e.user_id = b) or (c.owner_id = b and e.user_id = a));

  delete from public.friend_pins p
  where (p.user_id = a and p.friend_id = b) or (p.user_id = b and p.friend_id = a);

  delete from public.presence_viewers v
  where (v.user_id = a and v.viewer_id = b) or (v.user_id = b and v.viewer_id = a);

  delete from public.schedule_grants g
  where (g.owner_id = a and g.viewer_id = b) or (g.owner_id = b and g.viewer_id = a);

  update public.schedule_requests r set status = 'cancelled', responded_at = now()
  where r.status = 'pending' and ((r.owner_id = a and r.requester_id = b) or (r.owner_id = b and r.requester_id = a));

  select private.emit(a, 'presence');
  select private.emit(b, 'presence');
  select private.emit(a, 'calendar');
  select private.emit(b, 'calendar');
$$;

-- Once a day: a question nobody answered lapses, a permission past its end goes, and questions
-- older than three months are forgotten.
create function private.expire_schedule_sharing() returns void
language sql set search_path = '' as $$
  update public.schedule_requests set status = 'expired' where status = 'pending' and expires_at <= now();
  delete from public.schedule_grants where expires_at <= now();
  delete from public.schedule_requests where created_at < now() - interval '90 days';
$$;

do $$
begin
  perform cron.schedule('expire-schedule-sharing', '23 3 * * *', 'select private.expire_schedule_sharing()');
exception when others then
  raise warning 'pg_cron is unavailable (%). An expired permission is still refused on every read; its row just stays.', sqlerrm;
end $$;
