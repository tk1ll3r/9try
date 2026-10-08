import { Temporal } from "temporal-polyfill";
import { t } from "../../../kernel/i18n";

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

export const weekdayNames = [t("Thứ 2"), t("Thứ 3"), t("Thứ 4"), t("Thứ 5"), t("Thứ 6"), t("Thứ 7"), t("Chủ nhật")];

// The day in Vietnamese ("T2", "thứ 2", "CN") or in English ("Mon", "Monday"), then the times, the subject and a room.
const line = /^(?:(?:t|thứ)\s*([2-7])|(cn|chủ nhật)|(mon|tue|wed|thu|fri|sat|sun)[a-z]*)\s+(\d{1,2})[:h](\d{2})\s*[-–]\s*(\d{1,2})[:h](\d{2})\s+(.+?)(?:\s*@\s*(.+))?$/i;
const english = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Reads a pasted timetable, one class per line:
 *   T2 07:30-09:45 Cấu trúc dữ liệu @ B1.02
 * The day is T2 to T7 or CN, or Mon to Sun. The room after "@" is optional.
 */
export function parseTimetable(text: string): { classes: ClassDraft[]; rejected: string[] } {
  const classes: ClassDraft[] = [];
  const rejected: string[] = [];
  for (const raw of text.split("\n").map(value => value.trim()).filter(Boolean)) {
    const match = line.exec(raw);
    const time = (hour: string, minute: string) => `${hour.padStart(2, "0")}:${minute}`;
    const start = match && time(match[4], match[5]);
    const end = match && time(match[6], match[7]);
    if (!match || !start || !end || start >= end || start > "23:59" || end > "23:59" || match[5] > "59" || match[7] > "59") { rejected.push(raw); continue; }
    const weekday = match[1] ? Number(match[1]) - 1 : match[2] ? 7 : english.indexOf(match[3].toLowerCase()) + 1;
    classes.push({ weekday, start, end, title: match[8].trim(), place: match[9]?.trim() ?? "" });
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
