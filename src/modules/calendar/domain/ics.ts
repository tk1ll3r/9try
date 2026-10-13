import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill";
import { locale, t } from "../../../kernel/i18n";

type Component = InstanceType<typeof ICAL.Component>;
type Property = InstanceType<typeof ICAL.Property>;
type Time = InstanceType<typeof ICAL.Time>;
type Recur = InstanceType<typeof ICAL.Recur>;

export type IcsRule = "daily" | "weekly" | "monthly";

/** One date of a series that does not happen, or happens differently. `date` is the day it would have had, in the series's time zone. */
export interface IcsException {
  date: string;
  canceled: boolean;
  title?: string;
  /** A timed change: instants. An all-day change: first and last day. */
  start?: string;
  end?: string;
}

/** One row the import stores: a single event, or a series the app can repeat by itself. */
export interface IcsEvent {
  uid: string;
  title: string;
  place: string;
  kind: "timed" | "all_day";
  /** Timed: an instant. All day: "YYYY-MM-DD". */
  start: string;
  /** Timed: an instant. All day: the last day, included. */
  end: string;
  /** The zone the repeats are counted in. */
  timezone: string;
  repeat: { rule: IcsRule; until: string | null; exceptions: IcsException[] } | null;
  /** One time of a series that repeats in a way the app has no kind for. */
  expanded: boolean;
  /** Over at the time of reading: a single event that ended, or a series whose last day has passed. */
  ended: boolean;
}

export interface IcsFile {
  events: IcsEvent[];
  /** What was left out while reading, by reason. */
  skipped: { cancelled: number; duplicate: number; unreadable: number };
  /** The lines where the first unreadable events begin, at most five. */
  unreadableLines: number[];
  /** How many series were turned into dated events because the app has no such repeat. */
  expandedSeries: number;
}

export const maxFileBytes = 5_000_000;
export const maxFileEvents = 5_000;
/** The most rows one import stores. The server refuses more. */
export const maxImportRows = 1_000;
/** A series the app cannot repeat is read from a month back to a year ahead, and not beyond this many times. */
const expandedPerSeries = 200;
const untitled = () => t("(Không có tên)");

/**
 * The text of a calendar file. A file from Outlook can be UTF-16, and what Google's export gives is a
 * .zip with the calendars inside.
 */
export function decodeCalendar(bytes: Uint8Array): string {
  if (bytes.length > maxFileBytes) throw new Error(t("File .ics phải nhỏ hơn 5 MB."));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) throw new Error(t("Đây là file .zip. Hãy giải nén rồi chọn file .ics bên trong."));
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be"
    // Without a mark: every second byte of plain Latin text in UTF-16 is zero.
    : bytes.length > 3 && bytes[1] === 0 && bytes[3] === 0 ? "utf-16le" : "utf-8";
  return new TextDecoder(encoding).decode(bytes).replace(/^﻿/, "");
}

const pad = (value: number) => String(value).padStart(2, "0");
const dayOf = (time: Time) => `${time.year}-${pad(time.month)}-${pad(time.day)}`;
const weekdayCodes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** The zone a property names, when it is one the browser and the database know. Windows names are not. */
function namedZone(property: Property | null): string | null {
  const tzid = property?.getParameter("tzid");
  if (typeof tzid !== "string" || !tzid) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: tzid }); return tzid; } catch { return null; }
}

/** The moment a time stands for. A time whose zone the file does not define is wall-clock time in `zone`. */
function instantOf(time: Time, zone: string): Temporal.Instant {
  if (time.zone && time.zone.tzid !== "floating") return Temporal.Instant.fromEpochMilliseconds(time.toUnixTime() * 1000);
  return Temporal.PlainDateTime.from({ year: time.year, month: time.month, day: time.day, hour: time.hour, minute: time.minute, second: time.second })
    .toZonedDateTime(zone).toInstant();
}

/**
 * The calendar of a file. A single line the parser cannot read stops it, so a file that fails as a
 * whole is read again event by event, and the events that fail are left out with the line they begin on.
 */
function readCalendar(text: string): { roots: Component[]; unreadable: number[] } {
  const rootsOf = (source: string) => {
    const parsed = ICAL.parse(source) as unknown[];
    return (typeof parsed[0] === "string" ? [parsed] : parsed).map(root => new ICAL.Component(root as any[]));
  };
  try { return { roots: rootsOf(text), unreadable: [] }; } catch { /* Read it piece by piece below. */ }

  const frame: string[] = [];
  const blocks: { line: number; text: string }[] = [];
  const unreadable: number[] = [];
  let open: string[] | null = null;
  let openedAt = 0;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (/^BEGIN:VEVENT\s*$/i.test(line)) {
      if (open) unreadable.push(openedAt);
      open = [line]; openedAt = index + 1;
    } else if (open) {
      open.push(line);
      if (/^END:VEVENT\s*$/i.test(line)) { blocks.push({ line: openedAt, text: open.join("\r\n") }); open = null; }
    } else if (line.trim() && !/^END:VCALENDAR\s*$/i.test(line)) frame.push(line);
  }
  if (open) unreadable.push(openedAt);

  const readable = (source: string) => { try { ICAL.parse(source); return true; } catch { return false; } };
  // The frame holds the time zones. If the frame itself cannot be read, the events are read without it.
  const head = readable(`${frame.join("\r\n")}\r\nEND:VCALENDAR\r\n`) ? frame.join("\r\n") : "BEGIN:VCALENDAR\r\nVERSION:2.0";
  const good = blocks.filter(block => {
    const fine = readable(`BEGIN:VCALENDAR\r\n${block.text}\r\nEND:VCALENDAR\r\n`);
    if (!fine) unreadable.push(block.line);
    return fine;
  });
  try {
    return { roots: rootsOf(`${head}\r\n${good.map(block => block.text).join("\r\n")}${good.length ? "\r\n" : ""}END:VCALENDAR\r\n`), unreadable: unreadable.sort((a, b) => a - b) };
  } catch {
    throw new Error(t("Không đọc được file lịch này. Hãy xuất lại file từ ứng dụng lịch rồi thử lần nữa."));
  }
}

interface Read {
  title: string;
  place: string;
  allDay: boolean;
  /** Timed: instants. All day: first day and last day, included. */
  start: string;
  end: string;
}

/** What one VEVENT says, with the gaps filled: a name for an untitled event, half an hour for a moment, one day for a date. */
function read(component: Component, zone: string): Read {
  const event = new ICAL.Event(component);
  const begins = event.startDate;
  if (!begins) throw new Error("no start");
  const title = (String(component.getFirstPropertyValue("summary") ?? "").trim() || untitled()).slice(0, 240);
  const place = String(component.getFirstPropertyValue("location") ?? "").trim().slice(0, 200);
  const ends = event.endDate ?? begins;
  if (begins.isDate) {
    const first = dayOf(begins);
    const last = Temporal.PlainDate.from(dayOf(ends)).subtract({ days: 1 }).toString();
    return { title, place, allDay: true, start: first, end: last < first ? first : last };
  }
  const startZone = namedZone(component.getFirstProperty("dtstart")) ?? zone;
  const start = instantOf(begins, startZone);
  const end = instantOf(ends, namedZone(component.getFirstProperty("dtend")) ?? startZone);
  return { title, place, allDay: false, start: start.toString(), end: (Temporal.Instant.compare(end, start) > 0 ? end : start.add({ minutes: 30 })).toString() };
}

const isCancelled = (component: Component) => String(component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED";

/** The rule as one of the three repeats the app has, with the weekdays of a weekly one, or null for any other rule. */
function plainRule(component: Component, begins: Time): { rule: IcsRule; weekdays: number[] } | null {
  if (component.getAllProperties("rrule").length !== 1 || component.hasProperty("rdate") || component.hasProperty("exrule")) return null;
  const recur = component.getFirstPropertyValue("rrule") as Recur;
  if (recur.interval !== 1) return null;
  const parts = recur.parts as Record<string, (string | number)[] | undefined>;
  const used = Object.keys(parts).filter(key => parts[key]?.length);
  if (recur.freq === "DAILY") return used.length ? null : { rule: "daily", weekdays: [] };
  if (recur.freq === "WEEKLY") {
    if (used.some(key => key !== "BYDAY")) return null;
    const days = (parts.BYDAY ?? []).map(String);
    if (days.some(day => !weekdayCodes.includes(day))) return null;
    return { rule: "weekly", weekdays: [...new Set(days.map(day => weekdayCodes.indexOf(day) + 1))].sort() };
  }
  if (recur.freq === "MONTHLY") {
    // The app keeps a monthly event of the 31st on the last day of a short month; a file skips that month.
    if (begins.day > 28 || used.some(key => key !== "BYMONTHDAY")) return null;
    const days = parts.BYMONTHDAY ?? [];
    return days.length === 0 || (days.length === 1 && Number(days[0]) === begins.day) ? { rule: "monthly", weekdays: [] } : null;
  }
  return null;
}

/**
 * Reads a calendar file into the rows an import stores.
 * - A daily, weekly or monthly series becomes one repeating event with its skipped and changed dates.
 *   A weekly one on several weekdays becomes one per weekday.
 * - Any other series becomes a dated event for each time it happens, from a month before `now` to a year after.
 * - Times without a zone are wall-clock times in `zone`, the reader's own.
 */
export function parseIcs(text: string, options: { zone?: string; now?: Date } = {}): IcsFile {
  const zone = options.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = Temporal.Instant.fromEpochMilliseconds((options.now ?? new Date()).getTime());
  const today = now.toZonedDateTimeISO(zone).toPlainDate().toString();
  if (text.length > maxFileBytes) throw new Error(t("File .ics phải nhỏ hơn 5 MB."));
  if (!/^\s*BEGIN:VCALENDAR/im.test(text)) throw new Error(t("Đây không phải file lịch .ics."));

  const { roots, unreadable } = readCalendar(text);
  const components = roots.flatMap(root => root.getAllSubcomponents("vevent"));
  if (components.length > maxFileEvents) throw new Error(t("File có hơn {0} sự kiện. Hãy xuất một khoảng thời gian ngắn hơn rồi thử lại.", maxFileEvents.toLocaleString(locale)));

  const file: IcsFile = { events: [], skipped: { cancelled: 0, duplicate: 0, unreadable: unreadable.length }, unreadableLines: unreadable.slice(0, 5), expandedSeries: 0 };
  const taken = new Set<string>();
  const add = (uid: string, row: Read, extra: Pick<IcsEvent, "timezone" | "repeat" | "expanded">) => {
    if (taken.has(uid)) { file.skipped.duplicate++; return; }
    taken.add(uid);
    const until = extra.repeat?.until;
    const ended = extra.repeat ? until != null && until < today : row.allDay ? row.end < today : Temporal.Instant.compare(Temporal.Instant.from(row.end), now) < 0;
    file.events.push({ uid, title: row.title, place: row.place, kind: row.allDay ? "all_day" : "timed", start: row.start, end: row.end, ended, ...extra });
  };

  // A series and its changed dates share one UID.
  const masters: Component[] = [];
  const changes = new Map<string, Component[]>();
  for (const component of components) {
    const uid = String(component.getFirstPropertyValue("uid") ?? "");
    if (uid && component.hasProperty("recurrence-id")) changes.set(uid, [...changes.get(uid) ?? [], component]);
    else masters.push(component);
  }
  const mastered = new Set<string>();

  for (const master of masters) {
    try {
      const row = read(master, zone);
      const uid = String(master.getFirstPropertyValue("uid") ?? "") || `${row.start}-${row.title}`;
      if (isCancelled(master)) { file.skipped.cancelled++; continue; }
      const repeats = master.hasProperty("rrule") || master.hasProperty("rdate");
      if (!repeats) { add(uid, row, { timezone: zone, repeat: null, expanded: false }); continue; }
      if (mastered.has(uid)) { file.skipped.duplicate++; continue; }
      mastered.add(uid);
      const begins = new ICAL.Event(master).startDate;
      const plain = plainRule(master, begins);
      if (plain) addSeries(master, uid, row, plain, changes.get(uid) ?? []);
      else addEachTime(master, uid);
    } catch { file.skipped.unreadable++; }
  }
  // A changed date whose series is not in the file is an event by itself.
  for (const [uid, list] of changes) {
    if (mastered.has(uid)) continue;
    for (const change of list) {
      try {
        if (isCancelled(change)) { file.skipped.cancelled++; continue; }
        add(`${uid}#${dayOf(change.getFirstPropertyValue("recurrence-id") as Time)}`, read(change, zone), { timezone: zone, repeat: null, expanded: false });
      } catch { file.skipped.unreadable++; }
    }
  }

  file.events.sort((a, b) => a.start.localeCompare(b.start));
  return file;

  /** One repeating event, or one per weekday of a weekly series. */
  function addSeries(master: Component, uid: string, row: Read, plain: { rule: IcsRule; weekdays: number[] }, changed: Component[]) {
    const startProperty = master.getFirstProperty("dtstart");
    const timezone = namedZone(startProperty) ?? zone;
    const recur = master.getFirstPropertyValue("rrule") as Recur;
    const begins = new ICAL.Event(master).startDate;
    /** The day a time of this series falls on, in the series's zone. */
    const dateOf = (time: Time, property: Property | null = startProperty) => time.isDate ? dayOf(time)
      : instantOf(time, namedZone(property) ?? timezone).toZonedDateTimeISO(timezone).toPlainDate().toString();

    let until: string | null = recur.until ? dateOf(recur.until, null) : null;
    if (recur.count) {
      // The day of the last time the rule gives. A rule that runs for thousands of times is kept as one without an end.
      const rule = recur.iterator(begins);
      let last: Time | null = null;
      for (let counted = 0; counted < 5000; counted++) { const next = rule.next(); if (!next) break; last = next; }
      until = last && rule.completed ? dateOf(last) : null;
    }

    const exceptions: IcsException[] = [];
    for (const property of master.getAllProperties("exdate")) for (const value of property.getValues() as Time[]) exceptions.push({ date: dateOf(value, property), canceled: true });
    for (const change of changed) {
      try {
        const date = dateOf(change.getFirstPropertyValue("recurrence-id") as Time, change.getFirstProperty("recurrence-id"));
        if (isCancelled(change)) { exceptions.push({ date, canceled: true }); continue; }
        const other = read(change, zone);
        // A change that turns a timed event into a whole day, or back, keeps the series's times and takes the new name.
        exceptions.push(other.allDay === row.allDay ? { date, canceled: false, title: other.title, start: other.start, end: other.end } : { date, canceled: false, title: other.title });
      } catch { file.skipped.unreadable++; }
    }
    const byDate = [...new Map(exceptions.map(item => [item.date, item])).values()];

    const first = Temporal.PlainDate.from(row.allDay ? row.start : Temporal.Instant.from(row.start).toZonedDateTimeISO(timezone).toPlainDate());
    const weekdays = plain.weekdays.length ? plain.weekdays : [first.dayOfWeek];
    const several = weekdays.length > 1 || weekdays[0] !== first.dayOfWeek;
    for (const weekday of plain.rule === "weekly" ? weekdays : [first.dayOfWeek]) {
      const shift = (weekday - first.dayOfWeek + 7) % 7;
      const day = first.add({ days: shift });
      if (until && day.toString() > until) continue;
      const moved: Read = row.allDay
        ? { ...row, start: day.toString(), end: Temporal.PlainDate.from(row.end).add({ days: shift }).toString() }
        : (() => {
          const start = Temporal.Instant.from(row.start).toZonedDateTimeISO(timezone);
          const length = start.toInstant().until(Temporal.Instant.from(row.end));
          const at = day.toZonedDateTime({ timeZone: timezone, plainTime: start.toPlainTime() }).toInstant();
          return { ...row, start: at.toString(), end: at.add(length).toString() };
        })();
      const own = plain.rule === "weekly" ? byDate.filter(item => Temporal.PlainDate.from(item.date).dayOfWeek === weekday) : byDate;
      add(several ? `${uid}#${weekdayCodes[weekday - 1]}` : uid, moved, { timezone, repeat: { rule: plain.rule, until, exceptions: own }, expanded: false });
    }
  }

  /** A dated event for each time a series happens near `now`, computed by the parser's own expansion. */
  function addEachTime(master: Component, uid: string) {
    const event = new ICAL.Event(master);
    const from = now.toZonedDateTimeISO(zone).subtract({ months: 1 }).toInstant();
    const to = now.toZonedDateTimeISO(zone).add({ months: 12 }).toInstant();
    const startZone = namedZone(master.getFirstProperty("dtstart")) ?? zone;
    const times = event.iterator();
    let found = 0;
    for (let guard = 0; guard < 20_000 && found < expandedPerSeries; guard++) {
      const next = times.next();
      if (!next) break;
      const at = next.isDate ? Temporal.PlainDate.from(dayOf(next)).toZonedDateTime(zone).toInstant() : instantOf(next, startZone);
      if (Temporal.Instant.compare(at, to) >= 0) break;
      if (Temporal.Instant.compare(at, from) < 0) continue;
      const details = event.getOccurrenceDetails(next);
      const item = details.item.component;
      if (isCancelled(item)) { file.skipped.cancelled++; continue; }
      try {
        const row = item === master ? occurrence(master, details.startDate, details.endDate, startZone) : read(item, zone);
        add(`${uid}#${dayOf(next)}`, row, { timezone: zone, repeat: null, expanded: true });
        found++;
      } catch { file.skipped.unreadable++; }
    }
    if (found) file.expandedSeries++;
  }

  /** One time of a series, with the series's own name and place. */
  function occurrence(master: Component, begins: Time, ends: Time, startZone: string): Read {
    const base = read(master, zone);
    if (begins.isDate) {
      const first = dayOf(begins);
      const last = Temporal.PlainDate.from(dayOf(ends)).subtract({ days: 1 }).toString();
      return { ...base, start: first, end: last < first ? first : last };
    }
    const start = instantOf(begins, startZone);
    const end = instantOf(ends, startZone);
    return { ...base, start: start.toString(), end: (Temporal.Instant.compare(end, start) > 0 ? end : start.add({ minutes: 30 })).toString() };
  }
}

/**
 * The rows to store out of a file that was read: without what is over when the person asks for that,
 * and never more than the server takes. When there are more, the nearest to `now` are kept; a series
 * that still runs counts as now.
 */
export function chooseForImport(file: IcsFile, options: { skipEnded: boolean; now?: Date; limit?: number }): { chosen: IcsEvent[]; ended: number; overLimit: number } {
  const limit = options.limit ?? maxImportRows;
  const at = (options.now ?? new Date()).getTime();
  const wanted = options.skipEnded ? file.events.filter(event => !event.ended) : file.events;
  const distance = (event: IcsEvent) => event.repeat && !event.ended ? 0 : Math.abs(new Date(event.kind === "all_day" ? `${event.start}T00:00:00` : event.start).getTime() - at);
  const chosen = wanted.length > limit ? [...wanted].sort((a, b) => distance(a) - distance(b)).slice(0, limit).sort((a, b) => a.start.localeCompare(b.start)) : wanted;
  return { chosen, ended: file.events.length - wanted.length, overLimit: wanted.length - chosen.length };
}
