import { describe, expect, it } from "vitest";
import type { CalendarOccurrence } from "./Occurrence";
import { clock, dayBlocks, dayTitle, entriesByDay, entryDays, entryOf, entryOfAgenda, fillsDay, hourRange, minutesOn, monthTitle, monthWeeks, nearDay, scheduledMinutes, shiftMonths, weekOf, type CalendarEntry } from "./calendarView";

// Local times, so the tests say the same thing in every time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const timed = (id: string, start: string, end: string): CalendarEntry => ({ id, title: id, allDay: false, start, end, tone: "event" });
const allDay = (id: string, start: string, end: string): CalendarEntry => ({ id, title: id, allDay: true, start, end, tone: "event" });

describe("calendar days", () => {
  it("starts a week on Monday, also for a Sunday", () => {
    expect(weekOf("2026-10-08")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(weekOf("2026-10-11")[0]).toBe("2026-10-05");
  });
  it("gives a month the weeks it needs: four, five or six", () => {
    expect(monthWeeks("2027-02-10").map(week => week[0])).toEqual(["2027-02-01", "2027-02-08", "2027-02-15", "2027-02-22"]);
    const october = monthWeeks("2026-10-15");
    expect([october.length, october[0][0], october.at(-1)![6]]).toEqual([5, "2026-09-28", "2026-11-01"]);
    const august = monthWeeks("2026-08-01");
    expect([august.length, august[0][0], august.at(-1)![6]]).toEqual([6, "2026-07-27", "2026-09-06"]);
  });
  it("moves to a shorter month without leaving it", () => {
    expect(shiftMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(shiftMonths("2026-10-08", -1)).toBe("2026-09-08");
  });
  it("names days and months the way the screen shows them", () => {
    expect(dayTitle("2026-10-08")).toBe("Thứ năm, 8 tháng 10");
    expect(dayTitle("2026-10-11")).toBe("Chủ nhật, 11 tháng 10");
    expect(monthTitle("2026-10-08")).toBe("Tháng 10, 2026");
    expect(["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10"].map(day => nearDay(day, "2026-10-08"))).toEqual(["Hôm qua", "Hôm nay", "Ngày mai", ""]);
    expect([clock(0), clock(450), clock(1440)]).toEqual(["00:00", "07:30", "24:00"]);
  });
});

describe("calendar entries on their days", () => {
  it("puts an entry on every day it touches, and an entry that ends at midnight on its own day only", () => {
    expect(entryDays(timed("late", at(8, 22), at(9, 2)))).toEqual(["2026-10-08", "2026-10-09"]);
    expect(entryDays(timed("to-midnight", at(8, 22), at(9, 0)))).toEqual(["2026-10-08", "2026-10-08"]);
    expect(entryDays(allDay("trip", "2026-10-05", "2026-10-07"))).toEqual(["2026-10-05", "2026-10-06"]);
  });
  it("cuts a long entry to the part that falls on each day", () => {
    const camp = timed("camp", at(8, 18), at(10, 9, 30));
    expect([minutesOn(camp, "2026-10-08"), minutesOn(camp, "2026-10-09"), minutesOn(camp, "2026-10-10")]).toEqual([[1080, 1440], [0, 1440], [0, 570]]);
    expect([fillsDay(camp, "2026-10-08"), fillsDay(camp, "2026-10-09")]).toEqual([false, true]);
    expect(minutesOn(allDay("trip", "2026-10-05", "2026-10-07"), "2026-10-06")).toEqual([0, 1440]);
  });
  it("lists a day with what fills it first, then by start time", () => {
    const days = entriesByDay([timed("dinner", at(8, 18, 30), at(8, 20)), timed("class", at(8, 7, 30), at(8, 9, 45)), allDay("deadline", "2026-10-08", "2026-10-09"), allDay("trip", "2026-10-09", "2026-10-11")]);
    expect(days.get("2026-10-08")!.map(entry => entry.id)).toEqual(["deadline", "class", "dinner"]);
    expect([days.get("2026-10-09")!.length, days.get("2026-10-10")!.length, days.has("2026-10-11")]).toEqual([1, 1, false]);
  });
  it("places overlapping entries side by side and gives a short one a readable height", () => {
    const blocks = dayBlocks([timed("a", at(8, 8), at(8, 10)), timed("b", at(8, 9), at(8, 11)), timed("c", at(8, 10), at(8, 11)), timed("d", at(8, 13), at(8, 13, 10)), allDay("all", "2026-10-08", "2026-10-09")], "2026-10-08");
    expect(blocks.map(block => [block.entry.id, block.lane, block.lanes])).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 0, 2], ["d", 0, 1]]);
    expect([blocks[3].from, blocks[3].to]).toEqual([780, 810]);
    // Late at night the block moves up instead of running past the end of the day.
    expect(dayBlocks([timed("late", at(8, 23, 50), at(8, 23, 59))], "2026-10-08").map(block => [block.from, block.to])).toEqual([[1410, 1440]]);
  });
  it("shows the usual hours, and more when something is earlier or later", () => {
    expect(hourRange([])).toEqual([7, 21]);
    expect(hourRange(dayBlocks([timed("run", at(8, 5, 30), at(8, 6)), timed("night", at(8, 22), at(8, 23, 30))], "2026-10-08"))).toEqual([5, 24]);
  });
});

describe("hours on the calendar", () => {
  it("adds up the minutes of each day by what the entry is, without the entries that fill a day", () => {
    const lesson: CalendarEntry = { ...timed("class", at(8, 7, 30), at(8, 9, 45)), tone: "class" };
    const late = timed("late", at(8, 22), at(9, 1));
    expect(scheduledMinutes([lesson, late, timed("dinner", at(8, 18), at(8, 19, 30)), allDay("deadline", "2026-10-08", "2026-10-09")], ["2026-10-07", "2026-10-08", "2026-10-09"])).toEqual([
      { day: "2026-10-07", event: 0, class: 0, activity: 0, busy: 0 },
      { day: "2026-10-08", event: 210, class: 135, activity: 0, busy: 0 },
      { day: "2026-10-09", event: 60, class: 0, activity: 0, busy: 0 },
    ]);
  });
});

describe("what an entry is made from", () => {
  const occurrence = (extra: Partial<CalendarOccurrence>): CalendarOccurrence => ({
    id: "e", eventId: "e", occurrenceDate: "2026-10-08", title: "Cấu trúc dữ liệu", allDay: false, start: at(8, 7, 30), end: at(8, 9, 45), recurring: true,
    visibility: "only_me", timezone: "Asia/Ho_Chi_Minh", masterStart: at(8, 7, 30), masterEnd: at(8, 9, 45), category: "event", place: null, ...extra,
  });
  it("colors a class as a class and says who else sees an event", () => {
    expect(entryOf(occurrence({ category: "class", place: "B1.02" }))).toMatchObject({ tone: "class", kind: "Lớp học", place: "B1.02", recurring: true, audience: undefined });
    expect(entryOf(occurrence({ visibility: "group" }))).toMatchObject({ tone: "event", kind: undefined, audience: "Một nhóm" });
  });
  it("links what another module planned to that module's screen", () => {
    expect(entryOfAgenda({ id: "m1", title: "Ăn tối", start: at(8, 18), end: at(8, 20), kind: "Hoạt động", to: "/meetups/m1" }))
      .toMatchObject({ id: "agenda:m1", tone: "activity", kind: "Hoạt động", to: "/meetups/m1", allDay: false });
  });
});
