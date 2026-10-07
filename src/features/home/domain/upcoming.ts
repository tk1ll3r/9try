import { localDateKey } from "../../../kernel/dates";
import type { CalendarOccurrence } from "../../calendars/infrastructure/CalendarData";

// Date-only events belong to local calendar days, not UTC midnight.
export function selectUpcoming(events: CalendarOccurrence[], now: Date): CalendarOccurrence[] {
  return events.filter(event => event.allDay
    ? event.end > localDateKey(now)
    : Date.parse(event.end) > now.getTime())
    .sort((a, b) => startTime(a) - startTime(b) || a.id.localeCompare(b.id));
}

function startTime(event: CalendarOccurrence): number {
  return new Date(event.allDay ? `${event.start}T00:00:00` : event.start).getTime();
}

export function formatOccurrence(event: CalendarOccurrence): string {
  if (!event.allDay) return new Date(event.start).toLocaleString("vi-VN");
  return `${new Date(`${event.start}T00:00:00`).toLocaleDateString("vi-VN")} · Cả ngày`;
}
