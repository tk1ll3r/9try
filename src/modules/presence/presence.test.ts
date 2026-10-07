import { describe, expect, it } from "vitest";
import type { ActiveMode } from "./domain/ActivityMode";
import { remainingShare } from "./domain/ActivityMode";
import { defaultWeights, featured, FriendRanking, type Reason } from "./domain/FriendRanking";

const now = new Date("2026-10-07T10:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000).toISOString();
const person = (name: string) => ({ userId: name.toLowerCase(), displayName: name });
const mode = (userId: string, startedMinutesAgo: number, leftMinutes = 60): ActiveMode => ({ userId, mode: "studying", startedAt: minutes(-startedMinutesAgo), expiresAt: minutes(leftMinutes) });
const order = (ranked: { friend: { displayName: string } }[]) => ranked.map(item => item.friend.displayName);
const kha = person("Kha"), lan = person("Lan"), bao = person("Bảo"), thu = person("Thu");

describe("friend ranking", () => {
  it("puts the friend with a meetup soon and unread messages above one who shares a location, above one with only a mode", () => {
    const signals: Reason[] = [
      { userId: "kha", kind: "meetup", strength: 1 - 4 / 48, label: "Hẹn 18:00 hôm nay · Ăn tối", to: "/meetups/m1" },
      { userId: "kha", kind: "unread", strength: 3 / 5, label: "3 tin chưa đọc", to: "/chat/c1" },
      { userId: "lan", kind: "location", strength: 1, label: "Đang chia sẻ vị trí" },
    ];
    const ranked = new FriendRanking().rank([bao, lan, kha, thu], [mode("lan", 60), mode("bảo", 60)], signals, new Set(), now);
    expect(order(ranked)).toEqual(["Kha", "Lan", "Bảo", "Thu"]);
    expect(ranked.map(item => item.score)).toEqual([128, 74, 24, 0]);
    expect(ranked[0].reasons.map(reason => reason.label)).toEqual(["Hẹn 18:00 hôm nay · Ăn tối", "3 tin chưa đọc"]);
    expect(featured(ranked).map(item => item.friend.displayName)).toEqual(["Kha", "Lan"]);
  });
  it("keeps a pinned friend on top of friends with a higher score", () => {
    const ranked = new FriendRanking().rank([kha, thu], [], [{ userId: "kha", kind: "meetup", strength: 1, label: "Hẹn" }], new Set(["thu"]), now);
    expect(order(ranked)).toEqual(["Thu", "Kha"]);
    expect(featured(ranked).map(item => item.friend.displayName)).toEqual(["Thu", "Kha"]);
  });
  it("counts several reasons of one kind once, at their strongest", () => {
    const signals: Reason[] = [{ userId: "kha", kind: "meetup", strength: 0.5, label: "mai" }, { userId: "kha", kind: "meetup", strength: 0.9, label: "hôm nay" }];
    const [first] = new FriendRanking().rank([kha], [], signals, new Set(), now);
    expect(first.score).toBe(90);
    expect(first.reasons.map(reason => reason.label)).toEqual(["hôm nay"]);
  });
  it("gives a kind it does not know the default weight, and clamps a strength outside 0 to 1", () => {
    const ranked = new FriendRanking().rank([kha, lan], [], [{ userId: "kha", kind: "nudge", strength: 1 }, { userId: "lan", kind: "nudge", strength: 7 }], new Set(), now);
    expect(ranked.map(item => item.score)).toEqual([20, 20]);
  });
  it("counts a mode in full for its first 15 minutes, less after, and not at all once it is over", () => {
    const ranked = new FriendRanking().rank([kha, lan, thu], [mode("kha", 5), mode("lan", 30), mode("thu", 200, -1)], [], new Set(), now);
    expect(ranked.map(item => [item.friend.displayName, item.score, !!item.mode])).toEqual([["Kha", 40, true], ["Lan", 24, true], ["Thu", 0, false]]);
    expect(ranked[0].reasons.map(reason => reason.label)).toEqual(["Vừa bật"]);
    // A mode alone does not earn a large card.
    expect(featured(ranked)).toEqual([]);
  });
  it("breaks a tie by who has a mode on, then by name in Vietnamese order", () => {
    const anh = person("Ánh"), an = person("An"), binh = person("Bình");
    const signals: Reason[] = [{ userId: "bình", kind: "chat", strength: 24 / 45 }];
    const ranked = new FriendRanking().rank([binh, anh, an, lan], [mode("lan", 60)], signals, new Set(), now);
    expect(ranked.map(item => item.score)).toEqual([24, 24, 0, 0]);
    expect(order(ranked)).toEqual(["Lan", "Bình", "An", "Ánh"]);
  });
  it("follows the weights it is given", () => {
    const signals: Reason[] = [{ userId: "kha", kind: "meetup", strength: 1 }, { userId: "lan", kind: "unread", strength: 1 }];
    expect(order(new FriendRanking().rank([lan, kha], [], signals, new Set(), now))).toEqual(["Kha", "Lan"]);
    expect(order(new FriendRanking({ ...defaultWeights, unread: 150 }).rank([lan, kha], [], signals, new Set(), now))).toEqual(["Lan", "Kha"]);
  });
});

describe("mode time", () => {
  it("knows how much of a mode's time is left", () => {
    expect(remainingShare(mode("kha", 30, 90), now.getTime())).toBeCloseTo(0.75);
    expect(remainingShare(mode("kha", 30, -5), now.getTime())).toBe(0);
  });
});
