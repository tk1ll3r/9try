import { describe, expect, it } from "vitest";
import { defaultShortcuts, pickShortcuts, shortcutLimit, toggleShortcut } from "./domain/shortcuts";

const screens = [...defaultShortcuts, "/stats", "/habits"].map(to => ({ to }));

describe("shortcuts", () => {
  it("start from the usual four", () => {
    expect(pickShortcuts(screens, null).map(item => item.to)).toEqual(defaultShortcuts);
  });
  it("keep the chosen order and drop a screen this person cannot open", () => {
    expect(pickShortcuts(screens, ["/notes", "/expenses-of-someone-else", "/stats"]).map(item => item.to)).toEqual(["/notes", "/stats"]);
    expect(pickShortcuts(screens, [])).toEqual([]);
  });
  it("add at the end, take out, and stop at the limit", () => {
    expect(toggleShortcut(["/notes"], "/stats")).toEqual(["/notes", "/stats"]);
    expect(toggleShortcut(["/notes", "/stats"], "/notes")).toEqual(["/stats"]);
    const full = Array.from({ length: shortcutLimit }, (_, index) => `/s${index}`);
    expect(toggleShortcut(full, "/one-more")).toEqual(full);
  });
});
