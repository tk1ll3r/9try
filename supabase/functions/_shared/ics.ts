// Shared by the web app (src/modules/calendar/domain/icsExport.ts) and the calendar-feed function.
// It has no imports on purpose: Vite and Deno both load this file exactly as it is.

/** The columns of `calendar_events` and its exceptions that an iCalendar entry is made from. */
export interface IcsEventRow {
  id: string;
  title: string;
  event_kind: "timed" | "all_day";
  start_at: string | null;
  end_at: string | null;
  all_day_start: string | null;
  all_day_end_exclusive: string | null;
  timezone: string;
  recurrence_rule: "daily" | "weekly" | "monthly" | null;
  recurrence_until: string | null;
  place?: string | null;
  calendar_event_exceptions: {
    occurrence_date: string;
    canceled: boolean;
    override_title: string | null;
    override_start_at: string | null;
    override_end_at: string | null;
    override_all_day_start: string | null;
    override_all_day_end_exclusive: string | null;
  }[] | null;
}

/** Backslash, semicolon and comma get a backslash in front; a line break becomes the two characters "\n". */
const escapeText = (value: string) => value.replace(/[\\;,]/g, "\\$&").replace(/\r?\n/g, "\\n");
const compact = (value: string) => value.replace(/[-:]/g, "");
/** An instant as "20261012T003000Z". */
const utc = (instant: string | number) => `${compact(new Date(instant).toISOString().slice(0, 19))}Z`;
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
/** A wall-clock stamp such as "20261012T073000", read as if it were UTC. */
const stampMs = (stamp: string) => Date.UTC(+stamp.slice(0, 4), +stamp.slice(4, 6) - 1, +stamp.slice(6, 8), +stamp.slice(9, 11), +stamp.slice(11, 13), +stamp.slice(13, 15));

/** The wall-clock time of an instant in `zone`, as "20261012T073000". */
function local(instant: string, zone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return `${value("year")}${value("month")}${value("day")}T${value("hour")}${value("minute")}${value("second")}`;
}

/** Lines may be at most 75 bytes; longer ones continue on the next line after a space. */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let out = "", bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 74) { out += "\r\n "; bytes = 1; }
    out += char; bytes += size;
  }
  return out;
}

/**
 * Events as an iCalendar file that Google or Apple Calendar can import or subscribe to.
 * A repeating timed event keeps its own time zone, so it stays at the same local hour.
 */
export function toIcs(rows: IcsEventRow[], now = new Date()): string {
  const stamp = utc(now.getTime());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gnouht Together//VI", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Gnouht Together"];

  for (const row of rows) {
    const timed = row.event_kind === "timed";
    const repeats = row.recurrence_rule !== null;
    const firstStart = timed ? local(row.start_at!, row.timezone) : compact(row.all_day_start!);
    // What one occurrence of this event looks like at `start`..`end`.
    const times = (start: string, end: string) => !timed ? [`DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end)}`]
      : repeats ? [`DTSTART;TZID=${row.timezone}:${local(start, row.timezone)}`, `DTEND;TZID=${row.timezone}:${local(end, row.timezone)}`]
      : [`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`];
    // The original start of the occurrence on `date`, which is how an exception names it.
    const original = (date: string) => timed ? `;TZID=${row.timezone}:${compact(date)}${firstStart.slice(8)}` : `;VALUE=DATE:${compact(date)}`;
    const common = [`UID:${row.id}@gnouht.space`, `DTSTAMP:${stamp}`, ...(row.place ? [`LOCATION:${escapeText(row.place)}`] : [])];
    const exceptions = row.calendar_event_exceptions ?? [];

    lines.push("BEGIN:VEVENT", ...common, `SUMMARY:${escapeText(row.title)}`,
      ...times(timed ? row.start_at! : row.all_day_start!, timed ? row.end_at! : row.all_day_end_exclusive!));
    if (repeats) {
      // The app keeps a monthly event on the 31st at the end of shorter months, which is "the last day
      // of the month" to other calendars. ponytail: an event on the 29th or 30th still skips February
      // there; BYSETPOS would say it exactly, but parsers that ignore it would show three events a month.
      const monthEnd = row.recurrence_rule === "monthly" && firstStart.slice(6, 8) === "31" ? ";BYMONTHDAY=-1" : "";
      // A timed event ends with the occurrence on `recurrence_until`. That instant is estimated with the
      // first occurrence's UTC offset, which can be an hour off after a clock change, so the limit is put
      // twelve hours later: after that occurrence in every case and well before the next one.
      const until = !row.recurrence_until ? ""
        : timed ? `;UNTIL=${utc(stampMs(compact(row.recurrence_until) + firstStart.slice(8)) - (stampMs(firstStart) - Date.parse(row.start_at!)) + 12 * 3_600_000)}`
        : `;UNTIL=${compact(row.recurrence_until)}`;
      lines.push(`RRULE:FREQ=${row.recurrence_rule!.toUpperCase()}${monthEnd}${until}`);
      for (const exception of exceptions.filter(item => item.canceled)) lines.push(`EXDATE${original(exception.occurrence_date)}`);
    }
    lines.push("END:VEVENT");

    // A moved or renamed occurrence is its own entry that points at the date it replaces.
    for (const exception of exceptions.filter(item => !item.canceled)) {
      const start = timed ? exception.override_start_at ?? row.start_at! : exception.override_all_day_start ?? exception.occurrence_date;
      const end = timed ? exception.override_end_at ?? row.end_at! : exception.override_all_day_end_exclusive ?? nextDay(exception.occurrence_date);
      if (timed && !exception.override_start_at) continue; // a rename without a new time needs the computed occurrence time; skipped
      lines.push("BEGIN:VEVENT", ...common, `RECURRENCE-ID${original(exception.occurrence_date)}`,
        `SUMMARY:${escapeText(exception.override_title ?? row.title)}`, ...times(start, end), "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
