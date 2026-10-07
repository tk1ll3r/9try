import { describe, expect, it } from "vitest";
import { chatSignals, type Conversation } from "./domain/Chat";

const now = new Date("2026-10-07T10:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const direct = (id: string, fields: Partial<Conversation>): Conversation => ({
  id, kind: "direct", title: id, otherUserId: `user-${id}`, recentMessages: 0, lastMessageAt: null, lastMessageBody: null, unreadCount: 0, ...fields,
});

describe("what conversations say about friends", () => {
  it("reports unread messages, at full strength from five on, with a link to the conversation", () => {
    const signals = chatSignals([direct("a", { unreadCount: 3, lastMessageAt: hoursAgo(1) }), direct("b", { unreadCount: 12, lastMessageAt: hoursAgo(1) })], now);
    expect(signals.filter(signal => signal.kind === "unread")).toEqual([
      { userId: "user-a", kind: "unread", strength: 0.6, label: "3 tin chưa đọc", to: "/chat/a" },
      { userId: "user-b", kind: "unread", strength: 1, label: "12 tin chưa đọc", to: "/chat/b" },
    ]);
  });
  it("weighs how much two people talk more than how lately", () => {
    const chatty = chatSignals([direct("a", { recentMessages: 60, lastMessageAt: hoursAgo(72) })], now)[0];
    const recent = chatSignals([direct("b", { recentMessages: 1, lastMessageAt: hoursAgo(2) })], now)[0];
    expect(chatty.label).toBe("Hay trò chuyện");
    expect(recent.label).toBe("Nhắn hôm nay");
    expect(chatty.strength).toBeGreaterThan(recent.strength);
    expect(recent.strength).toBeCloseTo(0.7 * Math.log2(2) / Math.log2(61) + 0.3);
  });
  it("lets a conversation fade within a week, and says nothing for a silent one or a group", () => {
    expect(chatSignals([direct("a", { lastMessageAt: hoursAgo(30) })], now)[0]).toMatchObject({ kind: "chat", label: "Nhắn hôm qua" });
    expect(chatSignals([direct("a", { lastMessageAt: hoursAgo(24 * 8) })], now)).toEqual([]);
    expect(chatSignals([direct("a", {})], now)).toEqual([]);
    expect(chatSignals([{ ...direct("g", { unreadCount: 4, recentMessages: 30 }), kind: "group", otherUserId: null }], now)).toEqual([]);
  });
});
