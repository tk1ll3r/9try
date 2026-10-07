import { Temporal } from "temporal-polyfill";
import type { CalendarEventRow, CalendarExceptionRow, CalendarOccurrence, RecurrenceRule } from "./Occurrence";

/** Every occurrence of a stored event that overlaps the range, with its exceptions applied. */
export function expand(
  row: CalendarEventRow,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  const exceptions = new Map(
    (row.calendar_event_exceptions ?? []).map((exception) => [exception.occurrence_date, exception]),
  );

  if (!row.recurrence_rule) {
    const single = row.event_kind === "timed"
      ? timedOccurrence(row, row.start_at!, row.end_at!, false, exceptions)
      : allDayOccurrence(row, row.all_day_start!, row.all_day_end_exclusive!, false, exceptions);
    return overlaps(single, rangeStart, rangeEnd) ? [single] : [];
  }

  return row.event_kind === "timed"
    ? expandTimed(row, exceptions, rangeStart, rangeEnd)
    : expandAllDay(row, exceptions, rangeStart, rangeEnd);
}

function expandTimed(
  row: CalendarEventRow,
  exceptions: Map<string, CalendarExceptionRow>,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  const first = Temporal.Instant.from(row.start_at!).toZonedDateTimeISO(row.timezone);
  let current = first;
  const originalEnd = Temporal.Instant.from(row.end_at!).toZonedDateTimeISO(row.timezone);
  const duration = current.until(originalEnd);
  const until = row.recurrence_until ? Temporal.PlainDate.from(row.recurrence_until) : null;
  const result: CalendarOccurrence[] = [];
  // An occurrence outside the master range can be moved into the visible range.
  const lastException = [...exceptions.keys()].sort().at(-1);
  const expansionEnd = lastException
    ? Math.max(rangeEnd.getTime(), Temporal.PlainDate.from(lastException).add({ days: 1 }).toZonedDateTime(row.timezone).epochMilliseconds)
    : rangeEnd.getTime();

  for (let guard = 0; guard < 2000; guard++) {
    const occurrenceDate = current.toPlainDate();
    if (until && Temporal.PlainDate.compare(occurrenceDate, until) > 0) break;
    if (current.epochMilliseconds >= expansionEnd) break;

    const end = current.add(duration);
    const item = timedOccurrence(
      row,
      current.toInstant().toString(),
      end.toInstant().toString(),
      true,
      exceptions,
    );
    // Apply cancellations and overrides BEFORE filtering by effective time.
    if (item && overlaps(item, rangeStart, rangeEnd)) result.push(item);

    current = first.add(step(row.recurrence_rule!, guard + 1));
  }

  return result;
}

function expandAllDay(
  row: CalendarEventRow,
  exceptions: Map<string, CalendarExceptionRow>,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  const first = Temporal.PlainDate.from(row.all_day_start!);
  let current = first;
  const originalEnd = Temporal.PlainDate.from(row.all_day_end_exclusive!);
  const durationDays = current.until(originalEnd).days;
  const until = row.recurrence_until ? Temporal.PlainDate.from(row.recurrence_until) : null;
  const endDate = Temporal.PlainDate.from(localDateString(rangeEnd));
  const rangeEndDate = rangeEnd.getTime() === new Date(`${endDate}T00:00:00`).getTime() ? endDate : endDate.add({ days: 1 });
  const lastException = [...exceptions.keys()].sort().at(-1);
  const exceptionEnd = lastException ? Temporal.PlainDate.from(lastException).add({ days: 1 }) : rangeEndDate;
  const expansionEnd = Temporal.PlainDate.compare(exceptionEnd, rangeEndDate) > 0 ? exceptionEnd : rangeEndDate;
  const result: CalendarOccurrence[] = [];

  for (let guard = 0; guard < 2000; guard++) {
    if (until && Temporal.PlainDate.compare(current, until) > 0) break;
    if (Temporal.PlainDate.compare(current, expansionEnd) >= 0) break;

    const end = current.add({ days: durationDays });
    const item = allDayOccurrence(row, current.toString(), end.toString(), true, exceptions);
    if (item && overlaps(item, rangeStart, rangeEnd)) result.push(item);

    current = first.add(step(row.recurrence_rule!, guard + 1));
  }

  return result;
}

function timedOccurrence(
  row: CalendarEventRow,
  start: string,
  end: string,
  recurring: boolean,
  exceptions: Map<string, CalendarExceptionRow>,
): CalendarOccurrence | null {
  const occurrenceDate = Temporal.Instant.from(start)
    .toZonedDateTimeISO(row.timezone)
    .toPlainDate()
    .toString();
  const exception = exceptions.get(occurrenceDate);
  if (exception?.canceled) return null;

  return {
    id: recurring ? `${row.id}:${occurrenceDate}` : row.id,
    eventId: row.id,
    occurrenceDate,
    title: exception?.override_title ?? row.title,
    allDay: false,
    start: exception?.override_start_at ?? start,
    end: exception?.override_end_at ?? end,
    recurring,
    visibility: row.visibility,
    timezone: row.timezone,
    masterStart: row.start_at!,
    masterEnd: row.end_at!,
    category: row.category ?? "event",
    place: row.place ?? null,
  };
}

function allDayOccurrence(
  row: CalendarEventRow,
  start: string,
  endExclusive: string,
  recurring: boolean,
  exceptions: Map<string, CalendarExceptionRow>,
): CalendarOccurrence | null {
  const exception = exceptions.get(start);
  if (exception?.canceled) return null;

  return {
    id: recurring ? `${row.id}:${start}` : row.id,
    eventId: row.id,
    occurrenceDate: start,
    title: exception?.override_title ?? row.title,
    allDay: true,
    start: exception?.override_all_day_start ?? start,
    end: exception?.override_all_day_end_exclusive ?? endExclusive,
    recurring,
    visibility: row.visibility,
    timezone: row.timezone,
    masterStart: row.all_day_start!,
    masterEnd: row.all_day_end_exclusive!,
    category: row.category ?? "event",
    place: row.place ?? null,
  };
}

/**
 * The distance from the first occurrence to the n-th. Counting from the first one keeps a
 * monthly event on the 31st: it lands on the last day of a short month and returns to the 31st.
 */
function step(recurrence: RecurrenceRule, n: number) {
  if (recurrence === "daily") return { days: n };
  if (recurrence === "weekly") return { weeks: n };
  return { months: n };
}

function overlaps(
  occurrence: CalendarOccurrence | null,
  rangeStart: Date,
  rangeEnd: Date,
): occurrence is CalendarOccurrence {
  if (!occurrence) return false;
  if (occurrence.allDay) {
    const start = Date.parse(`${occurrence.start}T00:00:00`);
    const end = Date.parse(`${occurrence.end}T00:00:00`);
    return start < rangeEnd.getTime() && end > rangeStart.getTime();
  }
  return Date.parse(occurrence.start) < rangeEnd.getTime()
    && Date.parse(occurrence.end) > rangeStart.getTime();
}

function localDateString(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
