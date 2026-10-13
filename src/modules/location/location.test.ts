import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { spaced } from "./application/spaced";
import { distanceMeters, distanceTo, freshness, locationSignals, type VisibleLocation } from "./domain/Location";
import { SupabaseLocationRepository } from "./infrastructure/SupabaseLocationRepository";

function repository() {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "is", "gt", "order", "upsert"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  const from = vi.fn(() => query);
  return { query, from, locations: new SupabaseLocationRepository({ from } as unknown as SupabaseClient, "owner") };
}

describe("location storage", () => {
  it("recovers only the owner's sessions that are neither stopped nor expired", async () => {
    const { query, from, locations } = repository();
    await locations.listOwned();
    expect(from).toHaveBeenCalledWith("location_sessions");
    expect(query.eq).toHaveBeenCalledWith("owner_id", "owner");
    expect(query.is).toHaveBeenCalledWith("stopped_at", null);
    expect(query.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });
  it("rounds an approximate position before it is sent", async () => {
    const { query, locations } = repository();
    const position = { timestamp: Date.parse("2026-10-07T01:00:00Z"), coords: { latitude: 10.772512, longitude: 106.698034, accuracy: 6 } } as GeolocationPosition;
    await locations.publish("s1", position, true);
    expect(query.upsert).toHaveBeenCalledWith(expect.objectContaining({ session_id: "s1", latitude: 10.773, longitude: 106.698, accuracy_m: 100 }));
    await locations.publish("s1", position, false);
    expect(query.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ latitude: 10.772512, longitude: 106.698034, accuracy_m: 6 }));
  });
});

describe("what location sharing says about friends", () => {
  it("names a friend who shares with the user, more strongly while the position is fresh", () => {
    const now = new Date("2026-10-07T10:00:00Z");
    const shared = (ownerId: string, secondsAgo: number | null): VisibleLocation => ({
      sessionId: `s-${ownerId}`, ownerId, ownerDisplayName: ownerId, ownerUsername: null, expiresAt: "2026-10-07T11:00:00Z", approximate: false,
      latitude: 10, longitude: 106, accuracyM: 10, recordedAt: secondsAgo === null ? null : new Date(now.getTime() - secondsAgo * 1000).toISOString(),
    });
    expect(locationSignals([shared("kha", 20), shared("lan", 300), shared("thu", null)], now)).toEqual([
      { userId: "kha", kind: "location", label: "Đang chia sẻ vị trí", to: "/me/location", strength: 1 },
      { userId: "lan", kind: "location", label: "Đang chia sẻ vị trí", to: "/me/location", strength: 0.6 },
      { userId: "thu", kind: "location", label: "Đang chia sẻ vị trí", to: "/me/location", strength: 0.6 },
    ]);
  });
});

describe("how far, and how fresh", () => {
  const friend = (extra: Partial<VisibleLocation>): VisibleLocation => ({
    sessionId: "s1", ownerId: "kha", ownerDisplayName: "Kha", ownerUsername: null, expiresAt: "2026-10-07T11:00:00Z", approximate: false,
    latitude: 10.7767, longitude: 106.7036, accuracyM: 8, recordedAt: "2026-10-07T10:00:00Z", ...extra,
  });
  const market = { latitude: 10.7725, longitude: 106.698 };

  it("measures a straight line over the ground", () => {
    // Ben Thanh market to the Opera House is about 770 m as the crow flies.
    const meters = distanceMeters(market, { latitude: 10.7767, longitude: 106.7036 });
    expect(meters).toBeGreaterThan(760);
    expect(meters).toBeLessThan(780);
    expect(distanceMeters(market, market)).toBe(0);
    expect(Math.round(distanceMeters({ latitude: 10, longitude: 106 }, { latitude: 11, longitude: 106 }) / 1000)).toBe(111);
  });
  it("gives an exact distance between two exact positions", () => {
    const far = distanceTo(friend({}), { ...market, accuracyM: 10 })!;
    expect(far.rough).toBe(false);
    expect(Math.round(far.meters)).toBe(Math.round(distanceMeters(market, { latitude: 10.7767, longitude: 106.7036 })));
  });
  it("gives a rough distance in steps of 100 m when either end is rough", () => {
    expect(distanceTo(friend({ approximate: true }), { ...market, accuracyM: 10 })).toEqual({ meters: 800, rough: true });
    expect(distanceTo(friend({}), { ...market, accuracyM: 150 })).toEqual({ meters: 800, rough: true });
    // Never "0 m" for a position known to 100 m.
    expect(distanceTo(friend({ approximate: true, latitude: market.latitude, longitude: market.longitude }), { ...market, accuracyM: 10 })).toEqual({ meters: 100, rough: true });
  });
  it("has no distance to a friend whose session has no position yet", () => {
    expect(distanceTo(friend({ latitude: null, longitude: null, recordedAt: null }), { ...market, accuracyM: 10 })).toBeNull();
  });
  it("calls a position old after a minute", () => {
    const at = Date.parse("2026-10-07T10:00:00Z");
    expect(freshness(friend({}), at + 60_000)).toBe("live");
    expect(freshness(friend({}), at + 60_001)).toBe("stale");
    expect(freshness(friend({ recordedAt: null }), at)).toBe("none");
  });
});

describe("the list of friends on the map, loaded in turns", () => {
  it("loads at once, then once per turn however many ask", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => load.mock.calls.length);
      const visible = spaced(load, 3_000);
      const first = visible();
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBe(1);

      // Three announcements in the next second: one load, when the turn comes.
      const waiting = [visible(), visible(), visible()];
      await vi.advanceTimersByTimeAsync(2_999);
      expect(load).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await Promise.all(waiting)).toEqual([2, 2, 2]);

      // After a quiet time the next one does not wait.
      await vi.advanceTimersByTimeAsync(10_000);
      const later = visible();
      await vi.advanceTimersByTimeAsync(0);
      expect(await later).toBe(3);
    } finally { vi.useRealTimers(); }
  });
  it("passes a failed load to those who waited for it, and loads again for the next", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("ok");
      const visible = spaced(load, 1_000);
      const failed = expect(visible()).rejects.toThrow("offline");
      await vi.advanceTimersByTimeAsync(0);
      await failed;
      const again = visible();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await again).toBe("ok");
    } finally { vi.useRealTimers(); }
  });
});
