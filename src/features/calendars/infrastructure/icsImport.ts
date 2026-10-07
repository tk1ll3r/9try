import ICAL from "ical.js";
import { Temporal } from "temporal-polyfill";

export interface IcsEvent {
  uid: string;
  title: string;
  kind: "timed" | "all_day";
  start: string;
  end: string; // all-day end is inclusive in the app; exclusive in ICS
}

export function parseIcs(text: string): { events: IcsEvent[]; skipped: number } {
  if (!/BEGIN:VCALENDAR/i.test(text) || text.length > 2_000_000) throw new Error("File .ics không hợp lệ hoặc lớn hơn 2 MB.");
  const calendar = new ICAL.Component(ICAL.parse(text));
  const components = calendar.getAllSubcomponents("vevent");
  if (components.length > 100) throw new Error("Chỉ hỗ trợ tối đa 100 sự kiện mỗi file. Hãy chia file nhỏ hơn.");
  const events: IcsEvent[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const component of components) {
    try {
      const event = new ICAL.Event(component);
      // Do not silently flatten recurrence rules, exceptions or cancelled entries.
      if (event.isRecurring() || event.isRecurrenceException() || component.hasProperty("recurrence-id") || component.getFirstPropertyValue("status") === "CANCELLED") {
        skipped++;
        continue;
      }
      const title = String(component.getFirstPropertyValue("summary") ?? "").trim();
      const uid = event.uid || `${event.startDate.toString()}-${title}`;
      const start = event.startDate;
      const end = event.endDate;
      if (!title || !start || !end || seen.has(uid)) { skipped++; continue; }
      const date = (time: typeof start) => `${time.year}-${String(time.month).padStart(2,"0")}-${String(time.day).padStart(2,"0")}`;
      if (start.isDate) {
        const first = date(start);
        const last = Temporal.PlainDate.from(date(end)).subtract({ days: 1 }).toString();
        if (last < first) { skipped++; continue; }
        events.push({ uid, title, kind: "all_day", start: first, end: last });
      } else {
        // Floating times are interpreted in the importing user's local timezone.
        const floating = (time: typeof start) => `${date(time)}T${String(time.hour).padStart(2,"0")}:${String(time.minute).padStart(2,"0")}:${String(time.second).padStart(2,"0")}`;
        const begins = start.zone?.tzid === "floating" ? floating(start) : start.toJSDate().toISOString();
        const ends = end.zone?.tzid === "floating" ? floating(end) : end.toJSDate().toISOString();
        if (!Number.isFinite(new Date(begins).getTime()) || new Date(ends) <= new Date(begins)) { skipped++; continue; }
        events.push({ uid, title, kind: "timed", start: begins, end: ends });
      }
      seen.add(uid);
    } catch { skipped++; }
  }
  return { events, skipped };
}
