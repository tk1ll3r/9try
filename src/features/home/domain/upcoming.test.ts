import { describe, expect, it } from "vitest";
import type { CalendarOccurrence } from "../../calendars/infrastructure/CalendarData";
import { formatOccurrence, localDateKey, selectUpcoming } from "./upcoming";
function event(id: string, start: string, end: string, allDay = false): CalendarOccurrence {
  return { id, eventId: id, occurrenceDate: start.slice(0, 10), title: id, start, end, allDay, recurring: false, visibility: "only_me", timezone: "Asia/Ho_Chi_Minh", masterStart: start, masterEnd: end };
}
describe("upcoming", () => {
  it("keeps ongoing events, filters ended ones and sorts date-only/timed correctly", () => {
    const now = new Date(2026, 9, 5, 12);
    const items = [event("future", new Date(2026,9,6,8).toISOString(), new Date(2026,9,6,9).toISOString()), event("today", "2026-10-05", "2026-10-06", true), event("old", "2026-10-04", "2026-10-05", true), event("ongoing", new Date(2026,9,5,11).toISOString(), new Date(2026,9,5,13).toISOString())];
    expect(selectUpcoming(items, now).map(e => e.id)).toEqual(["today", "ongoing", "future"]);
  });
  it("formats all-day dates locally without UTC day shifts", () => {
    expect(localDateKey(new Date(2026,9,5,23))).toBe("2026-10-05");
    expect(formatOccurrence(event("all", "2026-10-05", "2026-10-06", true))).toContain("5/10/2026");
  });
});
