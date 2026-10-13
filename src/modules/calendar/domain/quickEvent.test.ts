import { describe, expect, it } from "vitest";
import { presetStart, remember, shiftMinutes } from "./quickEvent";

// 8 October 2026 is a Thursday.
const thursday = new Date(2026, 9, 8, 10, 2);

describe("when a new event starts", () => {
  it("now is the next five-minute mark", () => {
    expect(presetStart("now", thursday)).toBe("2026-10-08T10:05");
    expect(presetStart("now", new Date(2026, 9, 8, 10, 5))).toBe("2026-10-08T10:05");
    expect(presetStart("now", new Date(2026, 9, 8, 23, 58))).toBe("2026-10-09T00:00");
  });
  it("tonight is 19:00, or now once the evening has begun", () => {
    expect(presetStart("tonight", thursday)).toBe("2026-10-08T19:00");
    expect(presetStart("tonight", new Date(2026, 9, 8, 21, 31))).toBe("2026-10-08T21:35");
  });
  it("tomorrow is 09:00 on the next day, across the end of a month", () => {
    expect(presetStart("tomorrow", thursday)).toBe("2026-10-09T09:00");
    expect(presetStart("tomorrow", new Date(2026, 9, 31, 22, 0))).toBe("2026-11-01T09:00");
  });
  it("this weekend is Saturday 09:00, and on the weekend itself the same day", () => {
    expect(presetStart("weekend", thursday)).toBe("2026-10-10T09:00");
    expect(presetStart("weekend", new Date(2026, 9, 5, 8, 0))).toBe("2026-10-10T09:00"); // Monday
    expect(presetStart("weekend", new Date(2026, 9, 10, 7, 0))).toBe("2026-10-10T09:00"); // Saturday, early
    expect(presetStart("weekend", new Date(2026, 9, 10, 14, 1))).toBe("2026-10-10T14:05"); // Saturday afternoon
    expect(presetStart("weekend", new Date(2026, 9, 11, 14, 1))).toBe("2026-10-11T14:05"); // Sunday
  });
});

describe("a length added to a start", () => {
  it("crosses midnight", () => {
    expect(shiftMinutes("2026-10-08T23:30", 60)).toBe("2026-10-09T00:30");
  });
});

describe("what was used last", () => {
  it("comes first, once, up to the limit", () => {
    expect(remember(["a", "b", "c"], ["c", "d"], 3)).toEqual(["c", "d", "a"]);
    expect(remember(["Thư viện"], [" Thư viện ", ""], 5)).toEqual(["Thư viện"]);
  });
});
