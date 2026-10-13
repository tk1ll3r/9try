-- Importing a calendar file in one call.
--
-- Until now the app stored an imported event with two requests of its own, one event after the other.
-- A timetable of a few hundred events took minutes, and a failure halfway left part of the file in.
-- import_calendar_events takes the whole batch and stores it in one transaction, for the caller only.
--
-- What an entry looks like (the app's reader of .ics files writes them):
--   { "uid": …, "title": …, "place": …, "kind": "timed" | "all_day",
--     "start": …, "end": …,          timed: instants; all day: first day and last day, the last included
--     "timezone": "Asia/Ho_Chi_Minh", "rule": null | "daily" | "weekly" | "monthly", "until": null | "YYYY-MM-DD",
--     "category": "event" | "class",
--     "exceptions": [ { "date": "YYYY-MM-DD", "canceled": true }, { "date": …, "canceled": false, "title": …, "start": …, "end": … } ] }
--
-- An event whose uid the caller already has is left as it is: importing a file again adds nothing and
-- never overwrites what was changed in the app since. Every imported event is private.
create function public.import_calendar_events(p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); item jsonb; change jsonb; entry integer := 0; made uuid;
  added integer := 0; already_there integer := 0; timed boolean;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'invalid import'; end if;
  if jsonb_array_length(p_events) > 1000 then raise exception 'too many events'; end if;

  for item in select value from jsonb_array_elements(p_events) loop
    entry := entry + 1;
    begin
      if coalesce(item->>'uid', '') = '' or length(item->>'uid') > 500 or item->>'kind' not in ('timed', 'all_day') then
        raise exception 'bad entry';
      end if;
      if exists(select 1 from public.calendar_events e where e.owner_id = me and e.external_uid = item->>'uid') then
        already_there := already_there + 1;
        continue;
      end if;
      timed := item->>'kind' = 'timed';
      insert into public.calendar_events(
        owner_id, title, event_kind, start_at, end_at, all_day_start, all_day_end_exclusive, timezone, visibility,
        recurrence_rule, recurrence_until, external_uid, place, category)
      values (
        me, left(trim(item->>'title'), 240), item->>'kind',
        case when timed then (item->>'start')::timestamptz end, case when timed then (item->>'end')::timestamptz end,
        case when not timed then (item->>'start')::date end, case when not timed then (item->>'end')::date + 1 end,
        item->>'timezone', 'only_me', item->>'rule', (item->>'until')::date, item->>'uid',
        nullif(left(trim(coalesce(item->>'place', '')), 200), ''), coalesce(item->>'category', 'event'))
      returning id into made;

      -- The skipped and changed dates of a series. A date named twice keeps its first entry.
      for change in select value from jsonb_array_elements(coalesce(item->'exceptions', '[]'::jsonb)) loop
        insert into public.calendar_event_exceptions(
          event_id, occurrence_date, canceled, override_title, override_start_at, override_end_at, override_all_day_start, override_all_day_end_exclusive)
        values (
          made, (change->>'date')::date, coalesce((change->>'canceled')::boolean, false), left(nullif(trim(change->>'title'), ''), 240),
          case when timed then (change->>'start')::timestamptz end, case when timed then (change->>'end')::timestamptz end,
          case when not timed then (change->>'start')::date end, case when not timed then (change->>'end')::date + 1 end)
        on conflict (event_id, occurrence_date) do nothing;
      end loop;
      added := added + 1;
    exception when others then
      -- Whatever the table refused (a title that is empty, an end before its start, an unknown zone),
      -- nothing of the batch is kept and the entry is named by its place in the list.
      raise exception 'invalid import entry %', entry;
    end;
  end loop;

  if added > 0 then perform private.emit(me, 'calendar'); end if;
  return jsonb_build_object('added', added, 'already_there', already_there);
end $$;

revoke execute on function public.import_calendar_events(jsonb) from public, anon;
grant execute on function public.import_calendar_events(jsonb) to authenticated;
