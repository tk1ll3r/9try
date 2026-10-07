import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), query: {} as Record<string, any>, result: { data: [] as any[], error: null as unknown } }));
vi.mock("../../../shared/infrastructure/supabase", () => ({ requireSupabase: () => ({ from: mock.from }) }));
import { CalendarData } from "./CalendarData";
beforeEach(() => {
  mock.result = { data: [], error: null };
  mock.query = {};
  for (const method of ["select", "eq", "order", "limit"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mock.result).then(resolve);
  mock.from.mockReset().mockReturnValue(mock.query);
});
describe("calendar occurrences", () => {
  it("calendar recurrence shares cancellations and overrides with Home", async () => {
    mock.result.data = [{
      id: "series", title: "Original", event_kind: "timed", start_at: "2026-10-05T01:00:00Z", end_at: "2026-10-05T02:00:00Z",
      all_day_start: null, all_day_end_exclusive: null, timezone: "Asia/Ho_Chi_Minh", visibility: "only_me", recurrence_rule: "daily", recurrence_until: "2026-10-07",
      calendar_event_exceptions: [{ occurrence_date: "2026-10-06", canceled: true }, { occurrence_date: "2026-10-07", canceled: false, override_title: "Changed" }],
    }];
    const events = await new CalendarData().listOccurrences("owner", new Date("2026-10-05T00:00:00Z"), new Date("2026-10-08T00:00:00Z"));
    expect(events.map(e => e.id)).toEqual(["series:2026-10-05", "series:2026-10-07"]);
    expect(events[1].title).toBe("Changed");
  });
  it.each([
    ["past moved later", "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", 1],
    ["future moved earlier", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", 0],
    ["future day moved into range", "2026-10-07T09:00:00Z", "2026-10-07T10:00:00Z", "2026-10-05T13:00:00Z", "2026-10-05T14:00:00Z", 1],
  ])("filters effective timed override: %s", async (_name, start, end, overrideStart, overrideEnd, count) => {
    mock.result.data = [{ id: "moved", title: "Moved", event_kind: "timed", start_at: start, end_at: end,
      timezone: "UTC", visibility: "only_me", recurrence_rule: "daily", recurrence_until: start.slice(0, 10),
      calendar_event_exceptions: [{ occurrence_date: start.slice(0, 10), canceled: false, override_start_at: overrideStart, override_end_at: overrideEnd }] }];
    const events = await new CalendarData().listOccurrences("owner", new Date("2026-10-05T12:00:00Z"), new Date("2026-10-06T00:00:00Z"));
    expect(events).toHaveLength(count);
    if (count) { expect(events[0].start).toBe(overrideStart); expect(events[0].occurrenceDate).toBe(start.slice(0, 10)); }
  });
  it.each([
    ["past day moved forward", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", 1],
    ["visible day moved out", "2026-10-05", "2026-10-06", "2026-10-02", "2026-10-03", 0],
    ["future day moved back", "2026-10-07", "2026-10-08", "2026-10-05", "2026-10-06", 1],
  ])("filters effective all-day override: %s", async (_name, start, end, overrideStart, overrideEnd, count) => {
    mock.result.data = [{ id: "moved-day", title: "Moved", event_kind: "all_day", all_day_start: start, all_day_end_exclusive: end,
      timezone: "Asia/Ho_Chi_Minh", visibility: "only_me", recurrence_rule: "daily", recurrence_until: start,
      calendar_event_exceptions: [{ occurrence_date: start, canceled: false, override_all_day_start: overrideStart, override_all_day_end_exclusive: overrideEnd }] }];
    const events = await new CalendarData().listOccurrences("owner", new Date(2026,9,5,12), new Date(2026,9,6,0));
    expect(events).toHaveLength(count); if (count) expect(events[0].start).toBe(overrideStart);
  });
  it("all-day calendar overlap uses local day boundaries", async () => {
    mock.result.data = [{ id: "day", title: "Day", event_kind: "all_day", start_at: null, end_at: null,
      all_day_start: "2026-10-05", all_day_end_exclusive: "2026-10-06", timezone: "Asia/Ho_Chi_Minh", visibility: "only_me", recurrence_rule: null, recurrence_until: null, calendar_event_exceptions: [] }];
    const data = new CalendarData();
    expect(await data.listOccurrences("owner", new Date(2026,9,5,23,59), new Date(2026,9,6,1))).toHaveLength(1);
    expect(await data.listOccurrences("owner", new Date(2026,9,6,0), new Date(2026,9,7,0))).toHaveLength(0);
  });
});
