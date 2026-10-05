import { Temporal } from "temporal-polyfill";
import { requireSupabase } from "../../../shared/infrastructure/supabase";

export type CalendarVisibility = "only_me" | "selected_friends" | "group" | "public";
export type RecurrenceRule = "daily" | "weekly" | "monthly";

interface CalendarExceptionRow {
  occurrence_date: string;
  canceled: boolean;
  override_title: string | null;
  override_start_at: string | null;
  override_end_at: string | null;
  override_all_day_start: string | null;
  override_all_day_end_exclusive: string | null;
}

interface CalendarEventRow {
  id: string;
  title: string;
  event_kind: "timed" | "all_day";
  start_at: string | null;
  end_at: string | null;
  all_day_start: string | null;
  all_day_end_exclusive: string | null;
  timezone: string;
  visibility: CalendarVisibility;
  recurrence_rule: RecurrenceRule | null;
  recurrence_until: string | null;
  calendar_event_exceptions: CalendarExceptionRow[] | null;
}

export interface CalendarOccurrence {
  id: string;
  eventId: string;
  occurrenceDate: string;
  title: string;
  allDay: boolean;
  start: string;
  end: string;
  recurring: boolean;
  visibility: CalendarVisibility;
  timezone: string;
  masterStart: string;
  masterEnd: string;
}

export interface CreateCalendarEventInput {
  userId: string;
  title: string;
  kind: "timed" | "all_day";
  start: string;
  end: string;
  timezone: string;
  visibility: CalendarVisibility;
  recurrence: RecurrenceRule | null;
  recurrenceUntil: string | null;
}

export class CalendarData {
  async listOccurrences(
    userId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<CalendarOccurrence[]> {
    const { data, error } = await requireSupabase()
      .from("calendar_events")
      .select(`
        id,title,event_kind,start_at,end_at,all_day_start,all_day_end_exclusive,
        timezone,visibility,recurrence_rule,recurrence_until,
        calendar_event_exceptions(
          occurrence_date,canceled,override_title,override_start_at,override_end_at,
          override_all_day_start,override_all_day_end_exclusive
        )
      `)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = (data ?? []) as CalendarEventRow[];
    return rows
      .flatMap((row) => expand(row, rangeStart, rangeEnd))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async create(input: CreateCalendarEventInput): Promise<void> {
    const db = requireSupabase();
    const base = {
      owner_id: input.userId,
      title: input.title.trim(),
      event_kind: input.kind,
      timezone: input.timezone,
      visibility: input.visibility,
      recurrence_rule: input.recurrence,
      recurrence_until: input.recurrenceUntil,
    };

    const payload = input.kind === "timed"
      ? {
          ...base,
          start_at: new Date(input.start).toISOString(),
          end_at: new Date(input.end).toISOString(),
          all_day_start: null,
          all_day_end_exclusive: null,
        }
      : {
          ...base,
          start_at: null,
          end_at: null,
          all_day_start: input.start,
          all_day_end_exclusive: Temporal.PlainDate.from(input.end).add({ days: 1 }).toString(),
        };

    const { error } = await db.from("calendar_events").insert(payload);
    if (error) throw error;
  }

  async updateWholeEvent(input: {
    eventId: string;
    title: string;
    allDay: boolean;
    start: string;
    end: string;
  }): Promise<void> {
    const payload = input.allDay
      ? {
          title: input.title.trim(),
          all_day_start: input.start,
          all_day_end_exclusive: Temporal.PlainDate.from(input.end).add({ days: 1 }).toString(),
        }
      : {
          title: input.title.trim(),
          start_at: new Date(input.start).toISOString(),
          end_at: new Date(input.end).toISOString(),
        };

    const { error } = await requireSupabase()
      .from("calendar_events")
      .update(payload)
      .eq("id", input.eventId);
    if (error) throw error;
  }

  async updateWholeSeriesFromOccurrence(input: {
    occurrence: CalendarOccurrence;
    title: string;
    start: string;
    end: string;
  }): Promise<void> {
    const { occurrence } = input;
    if (!occurrence.recurring) {
      await this.updateWholeEvent({
        eventId: occurrence.eventId,
        title: input.title,
        allDay: occurrence.allDay,
        start: input.start,
        end: input.end,
      });
      return;
    }

    if (occurrence.allDay) {
      const editedStart = Temporal.PlainDate.from(input.start);
      const editedEndExclusive = Temporal.PlainDate.from(input.end).add({ days: 1 });
      const durationDays = editedStart.until(editedEndExclusive).days;
      if (durationDays < 1) throw new Error("Khoảng ngày không hợp lệ.");

      const masterStart = Temporal.PlainDate.from(occurrence.masterStart);
      const { error } = await requireSupabase()
        .from("calendar_events")
        .update({
          title: input.title.trim(),
          all_day_end_exclusive: masterStart.add({ days: durationDays }).toString(),
        })
        .eq("id", occurrence.eventId);
      if (error) throw error;
      return;
    }

    const editedStart = Temporal.Instant.from(new Date(input.start).toISOString())
      .toZonedDateTimeISO(occurrence.timezone);
    const editedEnd = Temporal.Instant.from(new Date(input.end).toISOString())
      .toZonedDateTimeISO(occurrence.timezone);
    if (Temporal.ZonedDateTime.compare(editedEnd, editedStart) <= 0) {
      throw new Error("Thời gian kết thúc phải sau thời gian bắt đầu.");
    }

    const duration = editedStart.until(editedEnd);
    const masterStart = Temporal.Instant.from(occurrence.masterStart)
      .toZonedDateTimeISO(occurrence.timezone);
    const nextMasterStart = masterStart.with({
      hour: editedStart.hour,
      minute: editedStart.minute,
      second: editedStart.second,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    });
    const nextMasterEnd = nextMasterStart.add(duration);

    const { error } = await requireSupabase()
      .from("calendar_events")
      .update({
        title: input.title.trim(),
        start_at: nextMasterStart.toInstant().toString(),
        end_at: nextMasterEnd.toInstant().toString(),
      })
      .eq("id", occurrence.eventId);
    if (error) throw error;
  }

  async editOccurrence(input: {
    eventId: string;
    occurrenceDate: string;
    title: string;
    allDay: boolean;
    start: string;
    end: string;
  }): Promise<void> {
    const args = input.allDay
      ? {
          p_event_id: input.eventId,
          p_occurrence_date: input.occurrenceDate,
          p_canceled: false,
          p_title: input.title.trim(),
          p_start_at: null,
          p_end_at: null,
          p_all_day_start: input.start,
          p_all_day_end_exclusive: Temporal.PlainDate.from(input.end).add({ days: 1 }).toString(),
        }
      : {
          p_event_id: input.eventId,
          p_occurrence_date: input.occurrenceDate,
          p_canceled: false,
          p_title: input.title.trim(),
          p_start_at: new Date(input.start).toISOString(),
          p_end_at: new Date(input.end).toISOString(),
          p_all_day_start: null,
          p_all_day_end_exclusive: null,
        };

    const { error } = await requireSupabase().rpc("set_calendar_occurrence_exception", args);
    if (error) throw error;
  }

  async skipOccurrence(eventId: string, occurrenceDate: string): Promise<void> {
    const { error } = await requireSupabase().rpc("set_calendar_occurrence_exception", {
      p_event_id: eventId,
      p_occurrence_date: occurrenceDate,
      p_canceled: true,
      p_title: null,
      p_start_at: null,
      p_end_at: null,
      p_all_day_start: null,
      p_all_day_end_exclusive: null,
    });
    if (error) throw error;
  }

  async deleteWholeEvent(eventId: string): Promise<void> {
    const { error } = await requireSupabase().from("calendar_events").delete().eq("id", eventId);
    if (error) throw error;
  }
}

function expand(
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
  let current = Temporal.Instant.from(row.start_at!).toZonedDateTimeISO(row.timezone);
  const originalEnd = Temporal.Instant.from(row.end_at!).toZonedDateTimeISO(row.timezone);
  const duration = current.until(originalEnd);
  const until = row.recurrence_until ? Temporal.PlainDate.from(row.recurrence_until) : null;
  const result: CalendarOccurrence[] = [];

  for (let guard = 0; guard < 2000; guard++) {
    const occurrenceDate = current.toPlainDate();
    if (until && Temporal.PlainDate.compare(occurrenceDate, until) > 0) break;
    if (current.epochMilliseconds >= rangeEnd.getTime()) break;

    const end = current.add(duration);
    if (end.epochMilliseconds > rangeStart.getTime()) {
      const item = timedOccurrence(
        row,
        current.toInstant().toString(),
        end.toInstant().toString(),
        true,
        exceptions,
      );
      if (item && overlaps(item, rangeStart, rangeEnd)) result.push(item);
    }

    current = addRecurrence(current, row.recurrence_rule!);
  }

  return result;
}

function expandAllDay(
  row: CalendarEventRow,
  exceptions: Map<string, CalendarExceptionRow>,
  rangeStart: Date,
  rangeEnd: Date,
): CalendarOccurrence[] {
  let current = Temporal.PlainDate.from(row.all_day_start!);
  const originalEnd = Temporal.PlainDate.from(row.all_day_end_exclusive!);
  const durationDays = current.until(originalEnd).days;
  const until = row.recurrence_until ? Temporal.PlainDate.from(row.recurrence_until) : null;
  const rangeStartDate = Temporal.PlainDate.from(localDateString(rangeStart));
  const rangeEndDate = Temporal.PlainDate.from(localDateString(rangeEnd));
  const result: CalendarOccurrence[] = [];

  for (let guard = 0; guard < 2000; guard++) {
    if (until && Temporal.PlainDate.compare(current, until) > 0) break;
    if (Temporal.PlainDate.compare(current, rangeEndDate) >= 0) break;

    const end = current.add({ days: durationDays });
    if (Temporal.PlainDate.compare(end, rangeStartDate) > 0) {
      const item = allDayOccurrence(row, current.toString(), end.toString(), true, exceptions);
      if (item) result.push(item);
    }

    current = addPlainDateRecurrence(current, row.recurrence_rule!);
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
  };
}

function addRecurrence(
  value: Temporal.ZonedDateTime,
  recurrence: RecurrenceRule,
): Temporal.ZonedDateTime {
  if (recurrence === "daily") return value.add({ days: 1 });
  if (recurrence === "weekly") return value.add({ weeks: 1 });
  return value.add({ months: 1 });
}

function addPlainDateRecurrence(
  value: Temporal.PlainDate,
  recurrence: RecurrenceRule,
): Temporal.PlainDate {
  if (recurrence === "daily") return value.add({ days: 1 });
  if (recurrence === "weekly") return value.add({ weeks: 1 });
  return value.add({ months: 1 });
}

function overlaps(
  occurrence: CalendarOccurrence | null,
  rangeStart: Date,
  rangeEnd: Date,
): occurrence is CalendarOccurrence {
  if (!occurrence) return false;
  if (occurrence.allDay) {
    const start = Date.parse(`${occurrence.start}T00:00:00Z`);
    const end = Date.parse(`${occurrence.end}T00:00:00Z`);
    return start < rangeEnd.getTime() && end > rangeStart.getTime();
  }
  return Date.parse(occurrence.start) < rangeEnd.getTime()
    && Date.parse(occurrence.end) > rangeStart.getTime();
}

function localDateString(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const calendarData = new CalendarData();
