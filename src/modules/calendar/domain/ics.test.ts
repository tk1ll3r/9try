import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

const wrap = (body: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}END:VCALENDAR\r\n`;
const event = (props: string) => `BEGIN:VEVENT\r\n${props}END:VEVENT\r\n`;

describe("ICS import", () => {
  it("imports UTC timed events and decodes folded titles", () => {
    const result = parseIcs(wrap(event("UID:one\r\nSUMMARY:Buoi hoc dai \r\n tiep\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\n")));
    expect(result.events).toEqual([{ uid: "one", title: "Buoi hoc dai tiep", kind: "timed", start: "2026-10-05T08:00:00.000Z", end: "2026-10-05T09:00:00.000Z" }]);
  });
  it("keeps floating wall-clock times for the importing user's timezone", () => {
    const result = parseIcs(wrap(event("UID:floating\r\nSUMMARY:Hoc\r\nDTSTART:20261005T080000\r\nDTEND:20261005T090000\r\n")));
    expect(result.events[0]).toMatchObject({ kind: "timed", start: "2026-10-05T08:00:00", end: "2026-10-05T09:00:00" });
  });
  it("converts exclusive all-day end to inclusive local date", () => {
    const result = parseIcs(wrap(event("UID:trip\r\nSUMMARY:Du lich\r\nDTSTART;VALUE=DATE:20261005\r\nDTEND;VALUE=DATE:20261007\r\n")));
    expect(result.events[0]).toMatchObject({ kind: "all_day", start: "2026-10-05", end: "2026-10-06" });
  });
  it("skips recurring/cancelled events and duplicate UIDs", () => {
    const normal = event("UID:one\r\nSUMMARY:Mot\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\n");
    const recurring = event("UID:two\r\nSUMMARY:Lap\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\nRRULE:FREQ=DAILY\r\n");
    const cancelled = event("UID:three\r\nSUMMARY:Huy\r\nDTSTART:20261005T080000Z\r\nDTEND:20261005T090000Z\r\nSTATUS:CANCELLED\r\n");
    expect(parseIcs(wrap(normal + normal + recurring + cancelled))).toMatchObject({ skipped: 3, events: [{ uid: "one" }] });
  });
  it("rejects oversized and non-calendar content", () => {
    expect(() => parseIcs("bad")).toThrow();
    expect(() => parseIcs(wrap("X".repeat(2_000_000)))).toThrow();
  });
});
