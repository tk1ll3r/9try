import { Temporal } from "temporal-polyfill";
import type { CalendarEventRow } from "./Occurrence";

const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (value: string) => value.replace(/[-:]/g, "");
const utc = (instant: string) => compact(Temporal.Instant.from(instant).toString({ smallestUnit: "second" }));
const local = (instant: string, zone: string) => compact(Temporal.Instant.from(instant).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: "second" }));

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
 * The user's events as an iCalendar file that Google or Apple Calendar can import.
 * A repeating timed event keeps its own time zone, so it stays at the same local hour.
 */
export function toIcs(rows: CalendarEventRow[], now = new Date()): string {
  const stamp = utc(now.toISOString());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gnouht Together//VI", "CALSCALE:GREGORIAN"];

  for (const row of rows) {
    const timed = row.event_kind === "timed";
    const repeats = row.recurrence_rule !== null;
    // What one occurrence of this event looks like at `start`..`end`.
    const times = (start: string, end: string) => !timed ? [`DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end)}`]
      : repeats ? [`DTSTART;TZID=${row.timezone}:${local(start, row.timezone)}`, `DTEND;TZID=${row.timezone}:${local(end, row.timezone)}`]
      : [`DTSTART:${utc(start)}`, `DTEND:${utc(end)}`];
    // The original start of the occurrence on `date`, which is how an exception names it.
    const original = (date: string) => timed
      ? `;TZID=${row.timezone}:${compact(date)}T${local(row.start_at!, row.timezone).slice(9)}`
      : `;VALUE=DATE:${compact(date)}`;
    const common = [`UID:${row.id}@gnouht.space`, `DTSTAMP:${stamp}`, ...(row.place ? [`LOCATION:${escapeText(row.place)}`] : [])];
    const exceptions = row.calendar_event_exceptions ?? [];

    lines.push("BEGIN:VEVENT", ...common, `SUMMARY:${escapeText(row.title)}`,
      ...times(timed ? row.start_at! : row.all_day_start!, timed ? row.end_at! : row.all_day_end_exclusive!));
    if (repeats) {
      const until = !row.recurrence_until ? ""
        : timed ? `;UNTIL=${utc(Temporal.PlainDate.from(row.recurrence_until).toZonedDateTime({ timeZone: row.timezone, plainTime: "23:59:59" }).toInstant().toString())}`
        : `;UNTIL=${compact(row.recurrence_until)}`;
      lines.push(`RRULE:FREQ=${row.recurrence_rule!.toUpperCase()}${until}`);
      for (const exception of exceptions.filter(item => item.canceled)) lines.push(`EXDATE${original(exception.occurrence_date)}`);
    }
    lines.push("END:VEVENT");

    // A moved or renamed occurrence is its own entry that points at the date it replaces.
    for (const exception of exceptions.filter(item => !item.canceled)) {
      const start = timed ? exception.override_start_at ?? row.start_at! : exception.override_all_day_start ?? exception.occurrence_date;
      const end = timed ? exception.override_end_at ?? row.end_at! : exception.override_all_day_end_exclusive ?? Temporal.PlainDate.from(exception.occurrence_date).add({ days: 1 }).toString();
      if (timed && !exception.override_start_at) continue; // a rename without a new time needs the computed occurrence time; skipped
      lines.push("BEGIN:VEVENT", ...common, `RECURRENCE-ID${original(exception.occurrence_date)}`,
        `SUMMARY:${escapeText(exception.override_title ?? row.title)}`, ...times(start, end), "END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
