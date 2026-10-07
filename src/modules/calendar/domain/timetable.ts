import { Temporal } from "temporal-polyfill";

/** One class as typed in. `weekday` is 1 for Monday up to 7 for Sunday; times are "HH:MM". */
export interface ClassDraft {
  title: string;
  weekday: number;
  start: string;
  end: string;
  place: string;
}

/** A class of the timetable as stored. `until` is the last day of the term. */
export interface ClassEntry {
  id: string;
  title: string;
  place: string;
  weekday: number;
  start: string;
  end: string;
  until: string | null;
}

export const weekdayNames = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

const line = /^(?:(?:t|thứ)\s*([2-7])|(cn|chủ nhật))\s+(\d{1,2})[:h](\d{2})\s*[-–]\s*(\d{1,2})[:h](\d{2})\s+(.+?)(?:\s*@\s*(.+))?$/i;

/**
 * Reads a pasted timetable, one class per line:
 *   T2 07:30-09:45 Cấu trúc dữ liệu @ B1.02
 * The day is T2 to T7 or CN. The room after "@" is optional.
 */
export function parseTimetable(text: string): { classes: ClassDraft[]; rejected: string[] } {
  const classes: ClassDraft[] = [];
  const rejected: string[] = [];
  for (const raw of text.split("\n").map(value => value.trim()).filter(Boolean)) {
    const match = line.exec(raw);
    const time = (hour: string, minute: string) => `${hour.padStart(2, "0")}:${minute}`;
    const start = match && time(match[3], match[4]);
    const end = match && time(match[5], match[6]);
    if (!match || !start || !end || start >= end || start > "23:59" || end > "23:59" || match[4] > "59" || match[6] > "59") { rejected.push(raw); continue; }
    classes.push({ weekday: match[1] ? Number(match[1]) - 1 : 7, start, end, title: match[7].trim(), place: match[8]?.trim() ?? "" });
  }
  return { classes, rejected };
}

/** The first date on or after `termStart` ("YYYY-MM-DD") that falls on `weekday`. */
export function firstClassDate(termStart: string, weekday: number): string {
  const start = Temporal.PlainDate.from(termStart);
  return start.add({ days: (weekday - start.dayOfWeek + 7) % 7 }).toString();
}

/** A stored weekly class, read back as weekday and local times in its own time zone. */
export function classTimes(startAt: string, endAt: string, timezone: string) {
  const start = Temporal.Instant.from(startAt).toZonedDateTimeISO(timezone);
  const end = Temporal.Instant.from(endAt).toZonedDateTimeISO(timezone);
  const clock = (value: Temporal.ZonedDateTime) => `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
  return { weekday: start.dayOfWeek, start: clock(start), end: clock(end) };
}
