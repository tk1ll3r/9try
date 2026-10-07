import { describe, expect, it } from "vitest";
import { findFreeSlots, toInterval, type Interval } from "./freeSlots";

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const clock = (slots: Interval[]) => slots.map(slot => [new Date(slot.start).getDate(), new Date(slot.start).getHours(), new Date(slot.end).getHours()]);

describe("free time", () => {
  it("returns the gaps between everyone's busy times inside the daily window", () => {
    const vy = [{ start: at(12, 7, 30), end: at(12, 9, 45) }];                   // class
    const kha = [{ start: at(12, 9), end: at(12, 11) }, { start: at(12, 13), end: at(12, 17) }];
    expect(clock(findFreeSlots([...vy, ...kha], new Date(2026, 9, 12), 1, 8, 22, 60))).toEqual([[12, 11, 13], [12, 17, 22]]);
  });
  it("drops gaps shorter than the wanted length and handles overlapping busy times", () => {
    const busy = [{ start: at(12, 8), end: at(12, 12) }, { start: at(12, 10), end: at(12, 14) }, { start: at(12, 14, 30), end: at(12, 22) }];
    expect(findFreeSlots(busy, new Date(2026, 9, 12), 1, 8, 22, 60)).toEqual([]);
    expect(clock(findFreeSlots(busy, new Date(2026, 9, 12), 1, 8, 22, 30))).toEqual([[12, 14, 14]]);
  });
  it("starts from now on the first day and treats an all-day event as busy all day", () => {
    const holiday = toInterval({ allDay: true, start: "2026-10-13", end: "2026-10-14" } as never);
    expect(clock(findFreeSlots([holiday], new Date(2026, 9, 12, 20), 3, 8, 22, 60))).toEqual([[12, 20, 22], [14, 8, 22]]);
  });
});
