import ICAL from "ical.js";
import { describe, expect, it } from "vitest";
import { toIcs } from "./icsExport";
import type { CalendarEventRow } from "./Occurrence";
import { expand } from "./recurrence";
import { classTimes, firstClassDate, parseTimetable } from "./timetable";

describe("timetable", () => {
  it("reads pasted lines with Vietnamese weekdays and an optional room", () => {
    const { classes, rejected } = parseTimetable("T2 07:30-09:45 Cấu trúc dữ liệu @ B1.02\nthứ 5 13h00 - 15h15 Toán rời rạc\nCN 8:00-9:00 Tự học\nT8 07:30-09:00 Sai thứ\nT3 10:00-09:00 Ngược giờ");
    expect(classes).toEqual([
      { weekday: 1, start: "07:30", end: "09:45", title: "Cấu trúc dữ liệu", place: "B1.02" },
      { weekday: 4, start: "13:00", end: "15:15", title: "Toán rời rạc", place: "" },
      { weekday: 7, start: "08:00", end: "09:00", title: "Tự học", place: "" },
    ]);
    expect(rejected).toEqual(["T8 07:30-09:00 Sai thứ", "T3 10:00-09:00 Ngược giờ"]);
  });
  it("finds the first class date on or after the start of term", () => {
    expect(firstClassDate("2026-10-07", 3)).toBe("2026-10-07"); // a Wednesday
    expect(firstClassDate("2026-10-07", 1)).toBe("2026-10-12");
    expect(firstClassDate("2026-10-07", 7)).toBe("2026-10-11");
  });
  it("reads a stored class back in its own time zone", () => {
    expect(classTimes("2026-10-12T00:30:00Z", "2026-10-12T02:45:00Z", "Asia/Ho_Chi_Minh")).toEqual({ weekday: 1, start: "07:30", end: "09:45" });
  });
});

describe("ics export", () => {
  const weekly: CalendarEventRow = {
    id: "class-1", title: "Cấu trúc dữ liệu; tuần chẵn, lẻ", event_kind: "timed", start_at: "2026-10-12T00:30:00Z", end_at: "2026-10-12T02:45:00Z",
    all_day_start: null, all_day_end_exclusive: null, timezone: "Asia/Ho_Chi_Minh", visibility: "only_me", recurrence_rule: "weekly", recurrence_until: "2026-11-09",
    calendar_event_exceptions: [{ occurrence_date: "2026-10-19", canceled: true, override_title: null, override_start_at: null, override_end_at: null, override_all_day_start: null, override_all_day_end_exclusive: null }],
    category: "class", place: "B1.02",
  };
  const day: CalendarEventRow = {
    id: "day-1", title: "Nghỉ lễ", event_kind: "all_day", start_at: null, end_at: null, all_day_start: "2026-10-20", all_day_end_exclusive: "2026-10-21",
    timezone: "Asia/Ho_Chi_Minh", visibility: "only_me", recurrence_rule: null, recurrence_until: null, calendar_event_exceptions: [],
  };

  it("writes a file another calendar reads back with the same dates as this app shows", () => {
    const text = toIcs([weekly, day], new Date("2026-10-07T00:00:00Z"));
    expect(text.split("\r\n").every(lineOfFile => new TextEncoder().encode(lineOfFile).length <= 75)).toBe(true);

    const events = new ICAL.Component(ICAL.parse(text)).getAllSubcomponents("vevent").map(component => new ICAL.Event(component));
    expect(events.map(event => event.summary)).toEqual(["Cấu trúc dữ liệu; tuần chẵn, lẻ", "Nghỉ lễ"]);
    expect(events[0].location).toBe("B1.02");
    expect(events[1].startDate.isDate).toBe(true);

    // The other parser's dates for the weekly class, against this app's own engine.
    const iterator = events[0].iterator(); const theirs: string[] = [];
    for (let next = iterator.next(); next; next = iterator.next()) theirs.push(next.toString().slice(0, 10));
    const ours = expand(weekly, new Date("2026-10-01T00:00:00Z"), new Date("2026-12-01T00:00:00Z")).map(occurrence => occurrence.occurrenceDate);
    expect(ours).toEqual(["2026-10-12", "2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(theirs).toEqual(ours);
  });
});
