import { Temporal } from "temporal-polyfill";
import { dayTitle, localDateKey, weekdayLetters } from "../../../kernel/dates";
import type { AgendaItem } from "../../../kernel/module";
import type { CalendarOccurrence, CalendarVisibility } from "./Occurrence";

/** What gives an entry its color: the user's own event, a class, a plan from another module, a friend's busy time. */
export type EntryTone = "event" | "class" | "activity" | "busy";

/** One thing the calendar draws. Days are "YYYY-MM-DD" in the device's time zone. */
export interface CalendarEntry {
  id: string;
  title: string;
  allDay: boolean;
  /** An instant, or a day when `allDay`. */
  start: string;
  /** An instant, or the day after the last day when `allDay`. */
  end: string;
  tone: EntryTone;
  /** What it is, where the color alone does not say: "Lớp học", "Hoạt động". */
  kind?: string;
  place?: string | null;
  recurring?: boolean;
  /** Who else sees it. Absent while only the owner does. */
  audience?: string;
  /** Where a tap leads, for an entry that is changed on another screen. */
  to?: string;
}

export const audienceNames: Record<CalendarVisibility, string> = { only_me: "Chỉ mình tôi", selected_friends: "Bạn bè được chọn", group: "Một nhóm", public: "Công khai" };

export function entryOf(event: CalendarOccurrence): CalendarEntry {
  const isClass = event.category === "class";
  return {
    id: event.id, title: event.title, allDay: event.allDay, start: event.start, end: event.end, place: event.place, recurring: event.recurring,
    tone: isClass ? "class" : "event", kind: isClass ? "Lớp học" : undefined,
    audience: event.visibility === "only_me" ? undefined : audienceNames[event.visibility],
  };
}

/** Something another module put on the calendar, such as a confirmed meetup. */
export function entryOfAgenda(item: AgendaItem): CalendarEntry {
  return { id: `agenda:${item.id}`, title: item.title, allDay: false, start: item.start, end: item.end, tone: "activity", kind: item.kind, to: item.to };
}

const plain = (day: string) => Temporal.PlainDate.from(day);
export const shiftDays = (day: string, days: number) => plain(day).add({ days }).toString();
/** The same day of another month, or that month's last day when it is shorter. */
export const shiftMonths = (day: string, months: number) => plain(day).add({ months }).toString();
/** How many days later `to` is than `from`. */
export const daysBetween = (from: string, to: string) => plain(from).until(plain(to)).days;
/** True for a real day written as "YYYY-MM-DD". */
export function isDay(value: string | null): value is string {
  try { return !!value && plain(value).toString() === value; } catch { return false; }
}
/** The first moment of a day on this device. */
export const startOfDay = (day: string) => new Date(`${day}T00:00:00`);

/** The seven days, Monday first, of the week a day is in. */
export function weekOf(day: string): string[] {
  const monday = plain(day).subtract({ days: plain(day).dayOfWeek - 1 });
  return Array.from({ length: 7 }, (_, index) => monday.add({ days: index }).toString());
}

/** The weeks, Monday first, that together hold every day of the month a day is in. */
export function monthWeeks(day: string): string[][] {
  const first = plain(day).with({ day: 1 });
  const last = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const weeks: string[][] = [];
  for (let week = weekOf(first.toString()); week[0] <= last; week = weekOf(shiftDays(week[0], 7))) weeks.push(week);
  return weeks;
}

export { dayTitle, weekdayLetters };
/** "Tháng 10, 2026" */
export const monthTitle = (day: string) => `Tháng ${plain(day).month}, ${plain(day).year}`;
/** "Hôm nay", "Ngày mai", "Hôm qua", or nothing for any other day. */
export function nearDay(day: string, today: string): string {
  return day === today ? "Hôm nay" : day === shiftDays(today, 1) ? "Ngày mai" : day === shiftDays(today, -1) ? "Hôm qua" : "";
}

/** The first and the last day an entry touches. */
export function entryDays(entry: CalendarEntry): [first: string, last: string] {
  if (entry.allDay) return [entry.start, shiftDays(entry.end, -1)];
  const start = Date.parse(entry.start);
  // An entry that ends at midnight does not touch the day that begins then.
  return [localDateKey(new Date(start)), localDateKey(new Date(Math.max(start, Date.parse(entry.end) - 1)))];
}

/** The part of a day an entry takes, in minutes from midnight. An all-day entry takes all of it. */
export function minutesOn(entry: CalendarEntry, day: string): [from: number, to: number] {
  if (entry.allDay) return [0, 1440];
  const start = new Date(entry.start), end = new Date(entry.end);
  const from = localDateKey(start) < day ? 0 : start.getHours() * 60 + start.getMinutes();
  const to = localDateKey(end) > day ? 1440 : end.getHours() * 60 + end.getMinutes();
  return [from, Math.max(from, to)];
}

/** True for an entry that fills the whole day: an all-day entry, or a long one on a day in its middle. */
export const fillsDay = (entry: CalendarEntry, day: string) => { const [from, to] = minutesOn(entry, day); return to - from >= 1440; };

/** Minutes from midnight as "07:30". The end of a day is "24:00". */
export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Entries by the days they touch. In a day, the ones that fill it come first, then the others by start time. */
export function entriesByDay(entries: readonly CalendarEntry[]): Map<string, CalendarEntry[]> {
  const days = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const [first, last] = entryDays(entry);
    // A year of days is more than any view shows; a longer entry is cut there.
    for (let day = first, count = 0; day <= last && count < 366; day = shiftDays(day, 1), count++) {
      const list = days.get(day);
      if (list) list.push(entry); else days.set(day, [entry]);
    }
  }
  const order = (entry: CalendarEntry, day: string) => fillsDay(entry, day) ? -1 : minutesOn(entry, day)[0];
  for (const [day, list] of days) list.sort((a, b) => order(a, day) - order(b, day) || a.title.localeCompare(b.title, "vi"));
  return days;
}

/** A timed entry placed in the hour grid of one day. Entries that overlap share the width, in `lanes` columns. */
export interface DayBlock {
  entry: CalendarEntry;
  from: number;
  to: number;
  lane: number;
  lanes: number;
}

/** The entries of one day that have a time, placed side by side where they overlap. A short one is drawn `shortest` minutes tall. */
export function dayBlocks(entries: readonly CalendarEntry[], day: string, shortest = 30): DayBlock[] {
  const blocks = entries.filter(entry => !fillsDay(entry, day)).map(entry => {
    const [start, end] = minutesOn(entry, day);
    const from = Math.min(start, 1440 - shortest);
    return { entry, from, to: Math.max(end, from + shortest), lane: 0, lanes: 1 };
  }).sort((a, b) => a.from - b.from || b.to - a.to);
  // A group is a run of blocks that overlap one another; its blocks all get the group's number of lanes.
  let group: DayBlock[] = [], ends: number[] = [];
  const close = () => { for (const block of group) block.lanes = ends.length; group = []; ends = []; };
  for (const block of blocks) {
    if (group.length && block.from >= Math.max(...ends)) close();
    const free = ends.findIndex(end => end <= block.from);
    block.lane = free < 0 ? ends.length : free;
    ends[block.lane] = block.to;
    group.push(block);
  }
  close();
  return blocks;
}

/** How much of each given day has a time on it, in minutes by tone. An entry that fills a day has no hours and is left out. */
export function scheduledMinutes(entries: readonly CalendarEntry[], days: readonly string[]): ({ day: string } & Record<EntryTone, number>)[] {
  const byDay = entriesByDay(entries);
  return days.map(day => {
    const minutes = { day, event: 0, class: 0, activity: 0, busy: 0 };
    for (const entry of byDay.get(day) ?? []) {
      if (fillsDay(entry, day)) continue;
      const [from, to] = minutesOn(entry, day);
      minutes[entry.tone] += to - from;
    }
    return minutes;
  });
}

/** The hours an hour grid has to show for these blocks, and never fewer than `from` to `to`. */
export function hourRange(blocks: readonly DayBlock[], from = 7, to = 21): [first: number, last: number] {
  return [Math.min(from, ...blocks.map(block => Math.floor(block.from / 60))), Math.max(to, ...blocks.map(block => Math.ceil(block.to / 60)))];
}
