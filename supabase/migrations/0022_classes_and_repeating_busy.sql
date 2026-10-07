-- 1. Classes of a timetable are weekly repeating events with category 'class' and a room in `place`.
--    Skipping or moving one class uses the existing per-date exceptions.
-- 2. `external_uid` remembers where an imported event came from, so importing the same
--    .ics file twice does not add it twice.
-- 3. list_shared_busy returns repeating events with their rule and exceptions. get_shared_busy
--    only knew the first occurrence, so a weekly class looked busy once and free ever after.

alter table public.calendar_events
  add column if not exists external_uid text,
  add column if not exists place text,
  add column if not exists category text not null default 'event';

alter table public.calendar_events drop constraint if exists calendar_events_category_check;
alter table public.calendar_events add constraint calendar_events_category_check check (category in ('event', 'class'));

create unique index if not exists calendar_events_owner_external_uid
on public.calendar_events(owner_id, external_uid) where external_uid is not null;

-- Whether `p_viewer` may see when `p_owner_id` is busy: the owner, a friend the owner shares
-- with, or a member of a group the owner shares with. A block always wins.
create or replace function private.can_see_busy(p_owner_id uuid, p_viewer uuid) returns boolean
language sql stable set search_path = '' as $$
  select p_viewer is not null and (
    p_owner_id = p_viewer
    or (
      not private.is_blocked_between(p_viewer, p_owner_id)
      and exists(
        select 1 from public.availability_shares s
        where s.owner_id = p_owner_id
          and (
            (s.user_id = p_viewer and private.are_friends(p_viewer, p_owner_id))
            or (s.group_id is not null
                and public.is_group_member(s.group_id, p_viewer)
                and public.is_group_member(s.group_id, p_owner_id))
          )
      )
    )
  )
$$;

-- Times only. Titles, places and notes never leave the owner.
create or replace function public.list_shared_busy(p_owner_id uuid, p_from timestamptz, p_to timestamptz)
returns table(
  id uuid,
  event_kind text,
  start_at timestamptz,
  end_at timestamptz,
  all_day_start date,
  all_day_end_exclusive date,
  timezone text,
  recurrence_rule text,
  recurrence_until date,
  exceptions jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_to <= p_from or p_to > p_from + interval '90 days' then raise exception 'invalid range'; end if;
  if not private.can_see_busy(p_owner_id, auth.uid()) then raise exception 'availability not shared'; end if;

  return query
  select e.id, e.event_kind, e.start_at, e.end_at, e.all_day_start, e.all_day_end_exclusive,
    e.timezone, e.recurrence_rule, e.recurrence_until,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'occurrence_date', x.occurrence_date,
        'canceled', x.canceled,
        'override_start_at', x.override_start_at,
        'override_end_at', x.override_end_at,
        'override_all_day_start', x.override_all_day_start,
        'override_all_day_end_exclusive', x.override_all_day_end_exclusive
      ))
      from public.calendar_event_exceptions x where x.event_id = e.id
    ), '[]'::jsonb)
  from public.calendar_events e
  where e.owner_id = p_owner_id
    and (
      (e.recurrence_rule is null and (
        (e.event_kind = 'timed' and e.start_at < p_to and e.end_at > p_from)
        or (e.event_kind = 'all_day' and e.all_day_start < p_to::date and e.all_day_end_exclusive > p_from::date)
      ))
      or (e.recurrence_rule is not null
        and (e.recurrence_until is null or e.recurrence_until >= p_from::date)
        and coalesce(e.all_day_start, (e.start_at at time zone e.timezone)::date) <= p_to::date)
    );
end $$;

revoke execute on function public.list_shared_busy(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_shared_busy(uuid, timestamptz, timestamptz) to authenticated;
