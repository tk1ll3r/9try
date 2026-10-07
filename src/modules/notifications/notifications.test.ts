import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), query: {} as Record<string, any>, result: { data: [] as any[], error: null as unknown } }));
vi.mock("../../../shared/infrastructure/supabase", () => ({ requireSupabase: () => ({ from: mock.from }) }));
import { NotificationsData, notificationDestination } from "./NotificationsData";

beforeEach(() => {
  mock.result = { data: [], error: null };
  mock.query = {};
  for (const method of ["select", "eq", "order", "range", "update"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.single = vi.fn(async () => mock.result);
  mock.query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mock.result).then(resolve);
  mock.from.mockReset().mockReturnValue(mock.query);
});
describe("notifications", () => {
  it("pages only the current owner's notifications without fetching Home", async () => {
    await new NotificationsData().list("owner", 20);
    expect(mock.from).toHaveBeenCalledWith("notifications");
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mock.query.range).toHaveBeenCalledWith(20, 39);
  });
  it("scopes marking as read to owner and notification id", async () => {
    await new NotificationsData().markRead("owner", "notice");
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "notice");
    expect(mock.query.single).toHaveBeenCalled();
  });
  it("rejects external, protocol-relative and unknown action paths", () => {
    expect(notificationDestination("/meetups")).toBe("/meetups");
    expect(notificationDestination("/groups/1234")).toBe("/groups/1234");
    expect(notificationDestination("/")).toBe("/");
    for (const path of [null, "https://evil.example", "//evil.example", "/unrecognized", "/meetups?token=secret"]) expect(notificationDestination(path)).toBeNull();
  });
});
