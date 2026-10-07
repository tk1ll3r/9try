import { describe, expect, it, vi } from "vitest";
import { LocationController, type LocationState } from "./LocationController";

function fixture() {
  let state: LocationState | undefined;
  let success: PositionCallback = () => {};
  let failure: PositionErrorCallback = () => {};
  const deps = {
    list: vi.fn().mockResolvedValue([]), start: vi.fn().mockResolvedValue("new"),
    stop: vi.fn().mockResolvedValue(undefined), publish: vi.fn().mockResolvedValue(undefined),
    gps: { watchPosition: vi.fn((s: PositionCallback, e?: PositionErrorCallback | null) => { success = s; if (e) failure = e; return 7; }), clearWatch: vi.fn() },
    changed: (s: LocationState) => { state = s; },
  };
  return { deps, controller: new LocationController(deps), state: () => state!, success: (p: GeolocationPosition) => success(p), failure: (e: GeolocationPositionError) => failure(e) };
}
const position = { timestamp: Date.now(), coords: { latitude: 10, longitude: 106, accuracy: 5 } } as GeolocationPosition;

describe("location lifecycle", () => {
  it("recovers every owned session without activating GPS", async () => {
    const f = fixture(); f.deps.list.mockResolvedValue([{ id: "a", expires_at: "2099-01-01", approximate: false }, { id: "b", expires_at: "2099-01-01", approximate: true }]);
    await f.controller.refresh(); expect(f.state().sessions).toHaveLength(2); expect(f.deps.gps.watchPosition).not.toHaveBeenCalled();
    await f.controller.stop("a"); expect(f.state().sessions.map(s => s.id)).toEqual(["b"]);
  });
  it("keeps failed revocations visible and supports retry", async () => {
    const f = fixture(); await f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    f.deps.stop.mockRejectedValueOnce(new Error("offline")); await f.controller.stop("new");
    expect(f.state().sessions).toHaveLength(1); expect(f.state().error).toBe("offline");
    f.success(position); expect(f.deps.publish).not.toHaveBeenCalled(); expect(f.deps.gps.clearWatch).toHaveBeenCalledWith(7);
    await f.controller.stop("new"); expect(f.state().sessions).toHaveLength(0);
  });
  it("guards double starts synchronously and cleans a late start after dispose", async () => {
    const f = fixture(); await f.controller.refresh();
    let resolve!: (id: string) => void; f.deps.start.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    const starting = f.controller.start(30, ["friend"], false);
    await f.controller.start(30, ["friend"], false); expect(f.deps.start).toHaveBeenCalledTimes(1);
    f.controller.dispose(); resolve("late"); await starting;
    expect(f.deps.stop).toHaveBeenCalledWith("late"); expect(f.deps.gps.watchPosition).not.toHaveBeenCalled();
  });
  it("denied permission revokes empty session", async () => {
    const f = fixture(); await f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    f.failure({ code: 1, message: "denied" } as GeolocationPositionError);
    await Promise.resolve(); await Promise.resolve();
    expect(f.deps.stop).toHaveBeenCalledWith("new"); expect(f.deps.gps.clearWatch).toHaveBeenCalled();
  });
  it("invalidates late callbacks after disposal", async () => {
    const f = fixture(); await f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    f.controller.dispose(); f.success(position); expect(f.deps.publish).not.toHaveBeenCalled();
  });
  it("throttles publishing and clears expired watcher on recovery", async () => {
    const f = fixture(); await f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    f.success(position); f.success(position); expect(f.deps.publish).toHaveBeenCalledTimes(1);
    await f.controller.refresh(); f.success(position); expect(f.deps.publish).toHaveBeenCalledTimes(1);
    expect(f.deps.gps.clearWatch).toHaveBeenCalledWith(7);
  });
  it("ignores a deferred recovery that resolves after start", async () => {
    const f = fixture(); await f.controller.refresh();
    let resolve!: (rows: unknown[]) => void; f.deps.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const recovery = f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    resolve([]); await recovery; expect(f.state().sessions.map(s => s.id)).toEqual(["new"]);
  });
  it("ignores deferred recovery after stop and late in-flight publish failure", async () => {
    const f = fixture(); await f.controller.refresh(); await f.controller.start(30, ["friend"], false);
    let reject!: (error: Error) => void; f.deps.publish.mockReturnValueOnce(new Promise((_resolve, r) => { reject = r; }));
    f.success(position);
    let resolve!: (rows: unknown[]) => void; f.deps.list.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const recovery = f.controller.refresh(); await f.controller.stop("new");
    resolve([{ id: "new", expires_at: "2099-01-01", approximate: false }]); await recovery;
    reject(new Error("late publish")); await Promise.resolve(); await Promise.resolve();
    expect(f.state().sessions).toHaveLength(0); expect(f.state().error).toBe("");
  });
  it("shows recovery failure instead of pretending no sessions exist", async () => {
    const f = fixture(); f.deps.list.mockRejectedValue(new Error("offline")); await f.controller.refresh();
    expect(f.state().loading).toBe(false); expect(f.state().error).toBe("offline");
  });
});
