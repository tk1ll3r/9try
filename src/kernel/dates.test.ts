import { describe, expect, it } from "vitest";
import { dayTitle, lastDays, localDateTimeKey, weekdayIndex } from "./dates";

describe("days", () => {
  it("lists the last days oldest first, ending today, across a month's end", () => {
    expect(lastDays(3, new Date(2026, 9, 1, 23, 30))).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(lastDays(1, new Date(2026, 9, 8, 0, 5))).toEqual(["2026-10-08"]);
  });
  it("puts Monday first in the week and names a day in Vietnamese", () => {
    expect([weekdayIndex("2026-10-05"), weekdayIndex("2026-10-08"), weekdayIndex("2026-10-11")]).toEqual([0, 3, 6]);
    expect(dayTitle("2026-10-11")).toBe("Chủ nhật, 11 tháng 10");
  });
  it("writes a moment the way a datetime-local field wants it", () => {
    expect(localDateTimeKey(new Date(2026, 9, 8, 7, 5))).toBe("2026-10-08T07:05");
  });
});
