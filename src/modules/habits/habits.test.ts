import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { dateKeyInTimeZone, Habit, mondayOfWeek } from "./domain/Habit";
import { SupabaseHabitRepository } from "./infrastructure/SupabaseHabitRepository";

describe("profile calendar day", () => {
  it("matches the profile timezone rather than the device clock near midnight", () => {
    const instant = new Date("2026-10-05T00:30:00Z");
    expect(dateKeyInTimeZone("Asia/Ho_Chi_Minh", instant)).toBe("2026-10-05");
    expect(dateKeyInTimeZone("America/Los_Angeles", instant)).toBe("2026-10-04");
  });
  it("handles daylight-saving day transitions with profile timezone", () => {
    expect(dateKeyInTimeZone("America/Los_Angeles", new Date("2026-03-08T07:59:00Z"))).toBe("2026-03-07");
    expect(dateKeyInTimeZone("America/Los_Angeles", new Date("2026-03-08T08:01:00Z"))).toBe("2026-03-08");
  });
  it("starts weeks on Monday even across a year boundary", () => {
    expect(mondayOfWeek("2026-10-04")).toBe("2026-09-28");
    expect(mondayOfWeek("2026-10-05")).toBe("2026-10-05");
    expect(mondayOfWeek("2027-01-01")).toBe("2026-12-28");
  });
});

describe("habit", () => {
  const sunday = "2026-10-04";
  it("counts a weekly habit as done anywhere in the Monday–Sunday week, a daily one only today", () => {
    expect(new Habit("h", "Read", "weekly", ["2026-10-02"], sunday).done).toBe(true);
    expect(new Habit("h", "Read", "weekly", ["2026-09-27"], sunday).done).toBe(false);
    expect(new Habit("h", "Walk", "daily", ["2026-10-03"], sunday).done).toBe(false);
    expect(new Habit("h", "Walk", "daily", [sunday], sunday).done).toBe(true);
  });
  it("counts days in a row and lets today stay open without breaking the streak", () => {
    expect(new Habit("h", "Walk", "daily", ["2026-10-03", "2026-10-02", "2026-10-01"], sunday).streak).toBe(3);
    expect(new Habit("h", "Walk", "daily", [sunday, "2026-10-03", "2026-10-02"], sunday).streak).toBe(3);
    expect(new Habit("h", "Walk", "daily", ["2026-10-02", "2026-10-01"], sunday).streak).toBe(0);
    expect(new Habit("h", "Walk", "daily", [sunday, "2026-10-02"], sunday).streak).toBe(1);
    expect(new Habit("h", "Walk", "daily", [], sunday).streak).toBe(0);
  });
  it("counts weeks in a row for a weekly habit, across a month boundary", () => {
    // Weeks starting 28 Sep, 21 Sep and 14 Sep; the week of 7 Sep is missing.
    expect(new Habit("h", "Read", "weekly", ["2026-10-01", "2026-09-27", "2026-09-14", "2026-09-01"], sunday).streak).toBe(3);
    expect(new Habit("h", "Read", "weekly", ["2026-09-27", "2026-09-14"], sunday).streak).toBe(2);
  });
});

describe("habit repository", () => {
  it("reads completions for the profile's day, back to the start of the streak window", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:30:00Z")); // still Sunday 4 October in Los Angeles
    const since = vi.fn(), until = vi.fn();
    try {
      const from = vi.fn((table: string) => {
        const result = table === "personal_tasks" ? { data: [
          { id: "weekly", title: "Read", recurrence: "weekly" },
          { id: "daily", title: "Walk", recurrence: "daily" },
        ], error: null }
          : table === "profiles" ? { data: { timezone: "America/Los_Angeles" }, error: null }
          : { data: [{ task_id: "daily", completion_date: "2026-10-03" }, { task_id: "weekly", completion_date: "2026-10-02" }], error: null };
        const query: Record<string, any> = {};
        for (const method of ["select", "eq", "order", "in"]) query[method] = vi.fn(() => query);
        query.gte = vi.fn((...args: unknown[]) => { since(...args); return query; });
        query.lte = vi.fn((...args: unknown[]) => { until(...args); return query; });
        query.single = vi.fn(async () => result);
        query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
        return query;
      });
      const habits = await new SupabaseHabitRepository({ from } as unknown as SupabaseClient, "owner").list();
      expect(since).toHaveBeenCalledWith("completion_date", "2026-07-12");
      expect(until).toHaveBeenCalledWith("completion_date", "2026-10-04");
      expect(habits.find(habit => habit.id === "weekly")?.done).toBe(true);
      expect(habits.find(habit => habit.id === "daily")?.done).toBe(false);
      expect(habits.find(habit => habit.id === "daily")?.streak).toBe(1);
    } finally { vi.useRealTimers(); }
  });
  it("undoes through the server function, which knows the owner and the period", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    await new SupabaseHabitRepository({ rpc } as unknown as SupabaseClient, "owner").undoDone("habit");
    expect(rpc).toHaveBeenCalledWith("undo_routine_completion", { p_task_id: "habit" });
  });
});

describe("how well a habit was kept", () => {
  it("counts the days done out of the days asked for, and weeks for a weekly habit", () => {
    const thursday = "2026-10-08";
    const daily = new Habit("d", "Đọc", "daily", ["2026-10-08", "2026-10-07", "2026-10-05", "2026-10-01", "2026-09-20"], thursday);
    expect(daily.kept(7)).toEqual({ done: 3, of: 7 });
    expect(daily.kept(30)).toEqual({ done: 5, of: 30 });
    // Seven days ending on a Thursday touch two Monday–Sunday weeks; one of them has a completion.
    const weekly = new Habit("w", "Dọn phòng", "weekly", ["2026-10-06", "2026-09-22"], thursday);
    expect(weekly.kept(7)).toEqual({ done: 1, of: 2 });
  });
});
