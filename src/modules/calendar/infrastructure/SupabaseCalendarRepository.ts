import type { SupabaseClient } from "@supabase/supabase-js";
import { Temporal } from "temporal-polyfill";
import type { CalendarEventRow, CalendarExceptionRow, CalendarOccurrence, CreateCalendarEventInput, SharedCalendarOccurrence } from "../domain/Occurrence";
import { expand } from "../domain/recurrence";

/** The signed-in user's calendar in Supabase. Repeating events are expanded on this side. */
export class SupabaseCalendarRepository {
  constructor(private readonly db: SupabaseClient, private readonly ownerId: string) {}

  async listOccurrences(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<CalendarOccurrence[]> {
    const { data, error } = await this.db
      .from("calendar_events")
      .select(`
        id,title,event_kind,start_at,end_at,all_day_start,all_day_end_exclusive,
        timezone,visibility,recurrence_rule,recurrence_until,
        calendar_event_exceptions(
          occurrence_date,canceled,override_title,override_start_at,override_end_at,
          override_all_day_start,override_all_day_end_exclusive
        )
      `)
      .eq("owner_id", this.ownerId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const rows = (data ?? []) as CalendarEventRow[];
    return rows
      .flatMap((row) => expand(row, rangeStart, rangeEnd))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async create(input: CreateCalendarEventInput): Promise<void> {
    const db = this.db;
    const base = {
      owner_id: this.ownerId,
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

    const { data: created, error } = await db
      .from("calendar_events")
      .insert(payload as any)
      .select("id")
      .single();
    if (error) throw error;

    const { error: audienceError } = await db.rpc("set_calendar_event_audience", {
      p_event_id: created.id,
      p_user_ids: input.audienceUserIds ?? [],
      p_group_id: input.audienceGroupId ?? null,
    });
    if (audienceError) {
      await db.from("calendar_events").delete().eq("id", created.id);
      throw audienceError;
    }
  }

  async listSharedOccurrences(
    ownerId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<SharedCalendarOccurrence[]> {
    const { data, error } = await this.db.rpc("list_shared_calendar_events", {
      p_owner_id: ownerId,
      p_from: rangeStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    });
    if (error) throw error;

    const result: SharedCalendarOccurrence[] = [];
    for (const raw of data ?? []) {
      const row: CalendarEventRow = {
        id: raw.id,
        title: raw.title,
        event_kind: raw.event_kind,
        start_at: raw.start_at,
        end_at: raw.end_at,
        all_day_start: raw.all_day_start,
        all_day_end_exclusive: raw.all_day_end_exclusive,
        timezone: raw.timezone,
        visibility: raw.visibility,
        recurrence_rule: raw.recurrence_rule,
        recurrence_until: raw.recurrence_until,
        calendar_event_exceptions: Array.isArray(raw.exceptions)
          ? raw.exceptions as CalendarExceptionRow[]
          : [],
      };
      result.push(...expand(row, rangeStart, rangeEnd).map((occurrence) => ({
        ...occurrence,
        ownerId: raw.owner_id,
        ownerDisplayName: raw.owner_display_name || raw.owner_username || "Người dùng",
        ownerUsername: raw.owner_username,
        description: raw.description ?? "",
      })));
    }
    return result.sort((a, b) => a.start.localeCompare(b.start));
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

    const { error } = await this.db
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
      const { error } = await this.db
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

    const { error } = await this.db
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

    const { error } = await this.db.rpc("set_calendar_occurrence_exception", args);
    if (error) throw error;
  }

  async skipOccurrence(eventId: string, occurrenceDate: string): Promise<void> {
    const { error } = await this.db.rpc("set_calendar_occurrence_exception", {
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
    const { error } = await this.db.from("calendar_events").delete().eq("id", eventId);
    if (error) throw error;
  }
}
