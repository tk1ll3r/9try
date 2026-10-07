import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { locationSignals, type VisibleLocation } from "./domain/Location";
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
