export type CalendarVisibility = "only_me" | "selected_friends" | "group" | "public";
export type RecurrenceRule = "daily" | "weekly" | "monthly";
/** A class is a weekly event that belongs to the timetable. */
export type EventCategory = "event" | "class";

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
  /** Missing on databases that do not have the timetable columns yet. */
  category?: EventCategory | null;
  place?: string | null;
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
  category: EventCategory;
  /** A room or an address. */
  place: string | null;
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
  category?: EventCategory;
  place?: string;
  /** The id an imported event had in its source, so importing it again adds nothing. */
  externalUid?: string;
}

/** Who a shared event is shown to: the chosen friends, or one group. */
export interface EventAudience {
  userIds: string[];
  groupId: string | null;
}

export interface SharedCalendarOccurrence extends CalendarOccurrence {
  ownerId: string;
  ownerDisplayName: string;
  ownerUsername: string | null;
  description: string;
}
