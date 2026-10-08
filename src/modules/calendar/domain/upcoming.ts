import { localDateKey } from "../../../kernel/dates";
import type { AgendaItem } from "../../../kernel/module";
import type { CalendarOccurrence } from "./Occurrence";

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

/** A start time as "Th 5, 08/10, 09:00". */
const formatStart = (start: string) => new Date(start).toLocaleString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function formatOccurrence(event: CalendarOccurrence): string {
  if (!event.allDay) return formatStart(event.start);
  return `${new Date(`${event.start}T00:00:00`).toLocaleDateString("vi-VN")} · Cả ngày`;
}

/** One line of "Sắp tới": an event of the calendar, or something another module put on it. */
export interface UpcomingEntry {
  id: string;
  title: string;
  when: string;
  /** Only on entries of other modules: what the entry is. */
  kind?: string;
  to: string;
}

/** The next `limit` things that have not ended, soonest first. */
export function upcomingEntries(events: CalendarOccurrence[], agenda: readonly AgendaItem[], now: Date, limit = 6): UpcomingEntry[] {
  // An event of the calendar opens the calendar on its day.
  const own = selectUpcoming(events, now).map(event => ({ at: startTime(event), entry: { id: event.id, title: event.title, when: formatOccurrence(event), to: `/calendar?date=${event.allDay ? event.start : localDateKey(new Date(event.start))}` } as UpcomingEntry }));
  const others = agenda.filter(item => Date.parse(item.end) > now.getTime()).map(item => ({
    at: Date.parse(item.start),
    entry: { id: `${item.kind}:${item.id}`, title: item.title, when: formatStart(item.start), kind: item.kind, to: item.to } as UpcomingEntry,
  }));
  return [...own, ...others].sort((a, b) => a.at - b.at).slice(0, limit).map(item => item.entry);
}
