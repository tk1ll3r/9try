import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), query: {} as Record<string, any>, result: { data: null, error: null as unknown } }));
vi.mock("../../../shared/infrastructure/supabase", () => ({ requireSupabase: () => ({ from: mock.from }) }));
import { OrganizerData, dateKeyInTimeZone, mondayOfWeek } from "./OrganizerData";

beforeEach(() => {
  mock.result = { data: null, error: null };
  mock.query = {};
  for (const method of ["update", "delete", "eq", "select"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.single = vi.fn(async () => mock.result);
  mock.from.mockReset().mockReturnValue(mock.query);
});
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
  it("counts weekly completions in the profile's current week, not yesterday's daily completion", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-05T00:30:00Z")); // LA Sunday
    const start = vi.fn(), end = vi.fn();
    try {
      mock.from.mockImplementation((table: string) => {
        const result = table === "personal_tasks" ? { data: [
          { id: "weekly", title: "Read", recurrence: "weekly" },
          { id: "daily", title: "Walk", recurrence: "daily" },
        ], error: null }
          : table === "profiles" ? { data: { timezone: "America/Los_Angeles" }, error: null }
          : { data: [{ task_id: "weekly", completion_date: "2026-10-02" }, { task_id: "daily", completion_date: "2026-10-03" }], error: null };
        const query: Record<string, any> = {};
        for (const method of ["select", "eq", "order", "in"]) query[method] = vi.fn(() => query);
        query.gte = vi.fn((...args: unknown[]) => { start(...args); return query; });
        query.lte = vi.fn((...args: unknown[]) => { end(...args); return query; });
        query.single = vi.fn(async () => result);
        query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
        return query;
      });
      const routines = await new OrganizerData().listRoutines("owner");
      expect(start).toHaveBeenCalledWith("completion_date", "2026-09-28");
      expect(end).toHaveBeenCalledWith("completion_date", "2026-10-04");
      expect(routines.find(row => row.id === "weekly")?.completedInPeriod).toBe(true);
      expect(routines.find(row => row.id === "daily")?.completedInPeriod).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});

describe("personal note mutations", () => {
  it("edits only the owner's selected note", async () => {
    await new OrganizerData().updateNote("vy", "note", " Title ", " Body ");
    expect(mock.from).toHaveBeenCalledWith("personal_notes");
    expect(mock.query.update).toHaveBeenCalledWith({ title: "Title", body: "Body" });
    expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "vy");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "note");
    expect(mock.query.single).toHaveBeenCalled();
  });
  it("deletes only the owner's selected note and reports failure", async () => {
    mock.result.error = new Error("denied");
    await expect(new OrganizerData().deleteNote("vy", "note")).rejects.toThrow("denied");
    expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "vy");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "note");
  });
});
