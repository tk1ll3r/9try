import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notificationTarget } from "./domain/Notification";
import { SupabaseNotificationRepository } from "./infrastructure/SupabaseNotificationRepository";

const mock = { from: vi.fn(), query: {} as Record<string, any>, result: { data: [] as any[], error: null as unknown } };
const repository = () => new SupabaseNotificationRepository({ from: mock.from } as unknown as SupabaseClient, "owner");

beforeEach(() => {
  mock.result = { data: [], error: null };
  mock.query = {};
  for (const method of ["select", "eq", "order", "range", "update"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.single = vi.fn(async () => mock.result);
  mock.query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mock.result).then(resolve);
  mock.from.mockReset().mockReturnValue(mock.query);
});

describe("notifications", () => {
  it("pages only the current owner's notifications", async () => {
    await repository().list(20, 20);
    expect(mock.from).toHaveBeenCalledWith("notifications");
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mock.query.range).toHaveBeenCalledWith(20, 39);
  });
  it("scopes marking as read to owner and notification id", async () => {
    await repository().markRead("notice");
    expect(mock.query.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "notice");
    expect(mock.query.single).toHaveBeenCalled();
  });
  it("only follows action paths that the app recognizes", () => {
    const safePath = (path: string) => ["/", "/meetups"].includes(path) ? path : "/";
    expect(notificationTarget("/meetups", safePath)).toBe("/meetups");
    expect(notificationTarget("/", safePath)).toBe("/");
    for (const path of [null, "https://evil.example", "//evil.example", "/unrecognized"]) expect(notificationTarget(path, safePath)).toBeNull();
  });
});
