-- Correct poll summary boolean aggregation and add bounded recurring-event exceptions.

create or replace function public.get_meetup_poll_summary(p_meetup_id uuid)
returns table(
  option_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  available_count bigint,
  total_votes bigint,
  my_vote boolean
)
language sql stable security definer set search_path=public as $$
  select
    o.id,
    o.starts_at,
    o.ends_at,
    count(v.*) filter(where v.available),
    count(v.*),
    bool_or(v.available) filter(where v.user_id=auth.uid())
  from public.meetup_time_options o
  left join public.meetup_votes v on v.option_id=o.id
  where o.meetup_id=p_meetup_id
    and exists(
      select 1
      from public.meetups m
      where m.id=p_meetup_id
        and (
          m.organizer_id=auth.uid()
          or exists(
            select 1 from public.meetup_invitees i
            where i.meetup_id=m.id and i.user_id=auth.uid()
          )
        )
    )
  group by o.id,o.starts_at,o.ends_at
  order by o.starts_at
$$;

alter table public.calendar_events
  add column if not exists recurrence_until date;

alter table public.calendar_events
  add constraint calendar_events_recurrence_rule_check
  check(recurrence_rule is null or recurrence_rule in ('daily','weekly','monthly'));

alter table public.calendar_events
  add constraint calendar_events_recurrence_until_check
  check(
    recurrence_rule is null
    or recurrence_until is null
    or recurrence_until >= coalesce(all_day_start, (start_at at time zone timezone)::date)
  );

create table public.calendar_event_exceptions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  occurrence_date date not null,
  canceled boolean not null default false,
  override_title text,
  override_start_at timestamptz,
  override_end_at timestamptz,
  override_all_day_start date,
  override_all_day_end_exclusive date,
  created_at timestamptz not null default now(),
  unique(event_id,occurrence_date),
  check(
    canceled
    or (
      (override_start_at is not null and override_end_at is not null and override_end_at>override_start_at)
      or
      (override_all_day_start is not null and override_all_day_end_exclusive>override_all_day_start)
      or override_title is not null
    )
  )
);

alter table public.calendar_event_exceptions enable row level security;

create policy calendar_event_exceptions_owner_read
on public.calendar_event_exceptions
for select to authenticated
using(exists(
  select 1 from public.calendar_events e
  where e.id=event_id and e.owner_id=auth.uid()
));

create or replace function public.set_calendar_occurrence_exception(
  p_event_id uuid,
  p_occurrence_date date,
  p_canceled boolean,
  p_title text default null,
  p_start_at timestamptz default null,
  p_end_at timestamptz default null,
  p_all_day_start date default null,
  p_all_day_end_exclusive date default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare event_kind_now text; exception_id uuid;
begin
  select event_kind into event_kind_now
  from public.calendar_events
  where id=p_event_id
    and owner_id=auth.uid()
    and recurrence_rule is not null;

  if event_kind_now is null then raise exception 'recurring event not found'; end if;

  if not p_canceled and p_title is null then
    if event_kind_now='timed' and (p_start_at is null or p_end_at is null or p_end_at<=p_start_at) then
      raise exception 'invalid timed override';
    end if;
    if event_kind_now='all_day' and (
      p_all_day_start is null
      or p_all_day_end_exclusive is null
      or p_all_day_end_exclusive<=p_all_day_start
    ) then
      raise exception 'invalid all-day override';
    end if;
  end if;

  insert into public.calendar_event_exceptions(
    event_id,occurrence_date,canceled,override_title,
    override_start_at,override_end_at,
    override_all_day_start,override_all_day_end_exclusive
  )
  values(
    p_event_id,p_occurrence_date,p_canceled,nullif(trim(coalesce(p_title,'')),''),
    p_start_at,p_end_at,p_all_day_start,p_all_day_end_exclusive
  )
  on conflict(event_id,occurrence_date)
  do update set
    canceled=excluded.canceled,
    override_title=excluded.override_title,
    override_start_at=excluded.override_start_at,
    override_end_at=excluded.override_end_at,
    override_all_day_start=excluded.override_all_day_start,
    override_all_day_end_exclusive=excluded.override_all_day_end_exclusive
  returning id into exception_id;

  return exception_id;
end $$;

grant execute on function public.set_calendar_occurrence_exception(
  uuid,date,boolean,text,timestamptz,timestamptz,date,date
) to authenticated;
