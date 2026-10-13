import { describe, expect, it } from "vitest";
import { canEdit, canUnsend, chatSignals, layoutThread, readBy, roomSourcePath, roomTitle, type ChatMessage, type Conversation, type Room } from "./domain/Chat";
import { roomTime } from "./presentation/roomTime";

const now = new Date("2026-10-07T10:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();
const direct = (id: string, fields: Partial<Conversation>): Conversation => ({
  id, kind: "direct", title: id, otherUserId: `user-${id}`, recentMessages: 0, lastMessageAt: null, lastMessageBody: null, unreadCount: 0, closed: false, groupId: null, ownerId: null, muted: false, mutedUntil: null, ...fields,
});
const room = (fields: Partial<Room>): Room => ({
  id: "r1", source: { kind: "mode", id: "kha" }, title: "Cà phê", ownerId: "kha", ownerName: "Kha", closesAt: "2026-10-07T12:00:00Z",
  closed: false, joined: false, muted: false, removed: false, memberCount: 1, ...fields,
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

describe("temporary rooms", () => {
  it("put a friend who opened a discussion on their mode on the Mode screen, with the way in", () => {
    expect(chatSignals([], now, [room({})])).toEqual([{ userId: "kha", kind: "room", strength: 1, label: "Đang mở thảo luận", to: "/chat/r1" }]);
    expect(chatSignals([], now, [room({ joined: true })])[0].label).toBe("Đang thảo luận cùng bạn");
  });
  it("say nothing for a room that is closed, that the person was taken out of, or that is about an event or a meetup", () => {
    expect(chatSignals([], now, [room({ closed: true }), room({ removed: true }), room({ source: { kind: "meetup", id: "m1" } })])).toEqual([]);
  });
  it("are named after what they are about, keeping a mode room's title short", () => {
    expect(roomTitle(room({}))).toBe("Cà phê");
    expect(roomTitle(room({ source: { kind: "meetup", id: "m1" }, title: "Ăn tối" }))).toBe("Ăn tối");
  });
  it("lead back to what they are about", () => {
    expect(roomSourcePath(room({ source: { kind: "meetup", id: "m1" } }), "me")).toBe("/meetups/m1");
    expect(roomSourcePath(room({ source: { kind: "event", id: "e1" }, ownerId: "me" }), "me")).toBe("/calendar");
    expect(roomSourcePath(room({ source: { kind: "event", id: "e1" } }), "me")).toBe("/calendar/shared/kha");
    expect(roomSourcePath(room({}), "me")).toBe("/");
  });
  it("say when they close, and for a closed one when its messages go", () => {
    const at = Date.parse("2026-10-07T10:00:00Z");
    expect(roomTime(room({ closesAt: "2026-10-07T10:30:00Z" }), at)).toMatch(/^Đóng lúc \d{2}:\d{2} hôm nay$/);
    expect(roomTime(room({ closesAt: "2026-10-09T10:30:00Z" }), at)).toMatch(/^Đóng lúc \d{2}:\d{2} ngày \d{1,2}\/10$/);
    // Closed by the clock an hour ago: deleted seven days after that hour.
    expect(roomTime(room({ closed: true, closesAt: "2026-10-07T09:00:00Z" }), at)).toMatch(/^Đã đóng · tin nhắn bị xóa ngày 14\/10$/);
  });
});

describe("the layout of a thread", () => {
  // 08:00 on 7 October 2026, UTC. Days are counted in UTC here; the app counts them on the reader's device.
  const at = (minutes: number) => new Date(Date.UTC(2026, 9, 7, 8, minutes)).toISOString();
  const dayOf = (instant: string) => instant.slice(0, 10);
  const message = (id: string, senderId: string, minutes: number, fields: Partial<ChatMessage> = {}): ChatMessage => ({
    id, senderId, senderName: senderId, body: id, createdAt: at(minutes), replyTo: null, reactions: {}, myReaction: null, edited: false, deleted: false, photos: [], card: null, ...fields,
  });
  const shape = (items: ReturnType<typeof layoutThread>) => items.map(item => item.kind === "message" ? `${item.message.id}${item.first ? "^" : ""}${item.last ? "$" : ""}` : item.kind === "day" ? item.day : "unread");

  it("puts a line at each new day and joins messages by one person less than five minutes apart into a run", () => {
    const messages = [message("a", "kha", 0), message("b", "kha", 2), message("c", "kha", 9), message("d", "me", 10), message("e", "me", 11), message("f", "kha", 24 * 60)];
    expect(shape(layoutThread(messages, "me", 0, dayOf))).toEqual(["2026-10-07", "a^", "b$", "c^$", "d^", "e$", "2026-10-08", "f^$"]);
  });
  it("puts the unread line before the oldest of the messages by other people that were unread, and breaks a run there", () => {
    const messages = [message("a", "kha", 0), message("b", "kha", 1), message("c", "me", 2), message("d", "kha", 3), message("e", "kha", 4)];
    expect(shape(layoutThread(messages, "me", 3, dayOf))).toEqual(["2026-10-07", "a^$", "unread", "b^$", "c^$", "d^", "e$"]);
    expect(shape(layoutThread(messages, "me", 0, dayOf))).not.toContain("unread");
    // More unread than there are messages by others: the line goes before the first of them.
    expect(shape(layoutThread(messages, "me", 9, dayOf))[1]).toBe("unread");
  });
  it("lets a person change their own text for 15 minutes, and nothing else", () => {
    const now = Date.parse(at(20));
    expect(canEdit(message("a", "me", 6), "me", now)).toBe(true);
    expect(canEdit(message("a", "me", 4), "me", now)).toBe(false);
    expect(canEdit(message("a", "kha", 19), "me", now)).toBe(false);
    expect(canEdit(message("a", "me", 19, { deleted: true }), "me", now)).toBe(false);
    expect(canEdit(message("a", "me", 19, { pending: true }), "me", now)).toBe(false);
    expect(canEdit(message("a", "me", 19, { photos: [{ path: "c/a/0.jpg", width: 10, height: 10 }] }), "me", now)).toBe(false);
    expect(canEdit(message("a", "me", 19, { card: { path: "/meetups/1", title: "Ăn tối" } }), "me", now)).toBe(false);
  });
  it("lets a person take back their own message at any time, and whoever looks after the group take back any", () => {
    expect(canUnsend(message("a", "me", -5000), "me", false)).toBe(true);
    expect(canUnsend(message("a", "kha", 0), "me", false)).toBe(false);
    expect(canUnsend(message("a", "kha", 0), "me", true)).toBe(true);
    expect(canUnsend(message("a", "me", 0, { deleted: true }), "me", true)).toBe(false);
  });
  it("counts as having read a message whoever read up to it or beyond", () => {
    const marks = [{ userId: "kha", name: "Kha", avatarUrl: null, lastReadAt: at(10) }, { userId: "lan", name: "Lan", avatarUrl: null, lastReadAt: at(3) }, { userId: "thu", name: "Thu", avatarUrl: null, lastReadAt: null }];
    expect(readBy(marks, message("a", "me", 5)).map(mark => mark.name)).toEqual(["Kha"]);
    expect(readBy(marks, message("a", "me", 3)).map(mark => mark.name)).toEqual(["Kha", "Lan"]);
  });
});
