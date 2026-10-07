export type CalendarVisibility = "only_me" | "selected_friends" | "group" | "public";
export type RecurrenceRule = "daily" | "weekly" | "monthly";

/** One changed or skipped date of a repeating event, as stored. */
export interface CalendarExceptionRow {
  occurrence_date: string;
  canceled: boolean;
  override_title: string | null;
  override_start_at: string | null;
  override_end_at: string | null;
  override_all_day_start: string | null;
  override_all_day_end_exclusive: string | null;
}

/** A stored event. A repeating event is one row plus its exceptions. */
export interface CalendarEventRow {
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
  title: string;
  kind: "timed" | "all_day";
  start: string;
  end: string;
  timezone: string;
  visibility: CalendarVisibility;
  recurrence: RecurrenceRule | null;
  recurrenceUntil: string | null;
  audienceUserIds?: string[];
  audienceGroupId?: string | null;
}

export interface SharedCalendarOccurrence extends CalendarOccurrence {
  ownerId: string;
  ownerDisplayName: string;
  ownerUsername: string | null;
  description: string;
}
