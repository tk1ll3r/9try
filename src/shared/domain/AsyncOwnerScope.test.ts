import { describe, expect, it, vi } from "vitest";
import { AsyncOwnerScope } from "./AsyncOwnerScope";

describe("async owner lifecycle", () => {
  it("drops deferred mutation UI and refetch after owner changes", async () => {
    const scope = new AsyncOwnerScope(); scope.activate("A");
    const current = scope.capture("A");
    let resolve!: () => void;
    const api = new Promise<void>(r => { resolve = r; });
    const setUndo = vi.fn(); const refresh = vi.fn();
    const mutation = api.then(() => { if (!current()) return; setUndo("A"); refresh(); });
    scope.activate("B"); const bRead = scope.beginRequest("B");
    resolve(); await mutation;
    expect(setUndo).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled(); expect(bRead()).toBe(true);
    expect(scope.beginRequest("A")()).toBe(false); expect(bRead()).toBe(true);
  });
  it("invalidates errors, finalizers and reads on unmount and even A-B-A switches", () => {
    const scope = new AsyncOwnerScope(); scope.activate("A");
    const oldMutation = scope.capture("A"); const oldRead = scope.beginRequest("A");
    scope.dispose(); expect(oldMutation()).toBe(false); expect(oldRead()).toBe(false);
    scope.activate("B"); scope.activate("A"); expect(oldMutation()).toBe(false); expect(oldRead()).toBe(false);
  });
  it("keeps mutations valid during same-owner refresh but rejects superseded reads", () => {
    const scope = new AsyncOwnerScope(); scope.activate("A");
    const mutation = scope.capture("A"); const oldRead = scope.beginRequest("A"); const newRead = scope.beginRequest("A");
    expect(mutation()).toBe(true); expect(oldRead()).toBe(false); expect(newRead()).toBe(true);
  });
});
