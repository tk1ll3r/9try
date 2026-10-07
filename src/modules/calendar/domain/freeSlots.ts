import type { CalendarOccurrence } from "./Occurrence";

/** A stretch of time in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

/** An occurrence as the time it blocks. An all-day event blocks its local days from midnight to midnight. */
export function toInterval(occurrence: CalendarOccurrence): Interval {
  return occurrence.allDay
    ? { start: new Date(`${occurrence.start}T00:00:00`).getTime(), end: new Date(`${occurrence.end}T00:00:00`).getTime() }
    : { start: Date.parse(occurrence.start), end: Date.parse(occurrence.end) };
}

/**
 * The times when nobody in `busy` has anything, looking only at `fromHour`..`toHour` of each
 * of `days` days starting at `firstDay`, and keeping gaps of at least `minutes`.
 */
export function findFreeSlots(busy: Interval[], firstDay: Date, days: number, fromHour: number, toHour: number, minutes: number): Interval[] {
  const taken = [...busy].sort((a, b) => a.start - b.start);
  const slots: Interval[] = [];
  for (let day = 0; day < days; day++) {
    const open = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + day, fromHour).getTime();
    const close = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + day, toHour).getTime();
    let cursor = Math.max(open, firstDay.getTime());
    for (const interval of taken) {
      if (interval.end <= cursor || interval.start >= close) continue;
      if (interval.start - cursor >= minutes * 60_000) slots.push({ start: cursor, end: interval.start });
      cursor = Math.max(cursor, interval.end);
    }
    if (close - cursor >= minutes * 60_000) slots.push({ start: cursor, end: close });
  }
  return slots;
}
