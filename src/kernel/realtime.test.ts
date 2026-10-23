import { describe, expect, it } from "vitest";
import { queriesForRealtimeEvent } from "./realtime";

describe("realtime refresh", () => {
  it("reloads the moment list and the streak, and leaves signed photo addresses alone", () => {
    expect(queriesForRealtimeEvent("moments")).toEqual([
      { queryKey: ["moments"], exact: true },
      { queryKey: ["moments", "streaks"] },
      { queryKey: ["moments", "archive"] },
    ]);
  });
  it("reloads open chats and unread counts, and leaves photo addresses alone", () => {
    const keys = queriesForRealtimeEvent("chat").map(item => item.queryKey.join("/"));
    expect(keys).toEqual(["chat/conversations", "chat/messages", "chat/reads"]);
  });
  it("reloads notes when a friendship or a group changes, and ignores an unknown event", () => {
    expect(queriesForRealtimeEvent("friends").map(item => item.queryKey[0])).toEqual(["friends", "notes"]);
    expect(queriesForRealtimeEvent("groups").map(item => item.queryKey[0])).toEqual(["groups", "notes"]);
    expect(queriesForRealtimeEvent("relationship-streaks")).toEqual([
      { queryKey: ["friends", "shared-relationships"], exact: true },
    ]);
    expect(queriesForRealtimeEvent("typing")).toEqual([]);
  });
});
