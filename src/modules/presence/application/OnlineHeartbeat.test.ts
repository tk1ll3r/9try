import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnlineHeartbeat } from "./OnlineHeartbeat";

/** A page whose visibility the test sets, and a server that records what it is told. */
function setup(shared = true) {
  let visible = true;
  let listener = () => {};
  const calls: string[] = [];
  const server = { shared, fails: false };
  const heartbeat = new OnlineHeartbeat({
    sessionId: "tab-1",
    beat: async () => { if (server.fails) throw new Error("offline"); calls.push("beat"); return server.shared; },
    leave: () => { calls.push("leave"); },
    page: { visible: () => visible, onChange: next => { listener = next; return () => { listener = () => {}; }; } },
  });
  const show = (next: boolean) => { visible = next; listener(); };
  return { heartbeat, calls, server, show };
}

describe("the heartbeat of an open tab", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("beats at once, then every 30 seconds while the app is on screen", async () => {
    const { heartbeat, calls } = setup();
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["beat"]);
    await vi.advanceTimersByTimeAsync(65_000);
    expect(calls).toEqual(["beat", "beat", "beat"]);
  });

  it("says goodbye when the app is hidden and beats again as soon as it is back", async () => {
    const { heartbeat, calls, show } = setup();
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(0);
    show(false);
    expect(calls).toEqual(["beat", "leave"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toEqual(["beat", "leave"]);
    show(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["beat", "leave", "beat"]);
  });

  it("stops when the server says the person does not share, and starts again when they turn it on", async () => {
    const { heartbeat, calls, server } = setup(false);
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(90_000);
    // One question, no session on the server, so no goodbye either.
    expect(calls).toEqual(["beat"]);
    server.shared = true;
    heartbeat.sharingChanged(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual(["beat", "beat", "beat"]);
    heartbeat.sharingChanged(false);
    expect(calls.at(-1)).toBe("leave");
  });

  it("keeps trying through a lost connection, and says goodbye when the session ends", async () => {
    const { heartbeat, calls, server } = setup();
    server.fails = true;
    heartbeat.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual([]);
    server.fails = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual(["beat"]);
    heartbeat.dispose();
    expect(calls).toEqual(["beat", "leave"]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toEqual(["beat", "leave"]);
  });

  it("takes back a beat that arrives after the app was hidden", async () => {
    let answer = (_shared: boolean) => {};
    const calls: string[] = [];
    let visible = true; let listener = () => {};
    const heartbeat = new OnlineHeartbeat({
      sessionId: "tab-1", leave: () => { calls.push("leave"); },
      beat: () => new Promise<boolean>(resolve => { answer = resolve; }),
      page: { visible: () => visible, onChange: next => { listener = next; return () => {}; } },
    });
    heartbeat.start();
    visible = false; listener();
    expect(calls).toEqual([]); // the server never confirmed the tab as open
    answer(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual(["leave"]);
  });
});
