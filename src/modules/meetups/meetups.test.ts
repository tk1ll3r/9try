import { describe, expect, it } from "vitest";
import { isSoon, MeetupPolicy, meetupSignals, type MeetupStatus, type MeetupSummary } from "./domain/Meetup";

const meetup = (status: MeetupStatus): MeetupSummary => ({
  id: "m", groupId: null, organizerId: "organizer", title: "Ăn tối", description: "", status,
  startAt: null, endAt: null, capacity: null, locationName: null, rsvp: "pending",
});
const allowed = (status: MeetupStatus, userId: string) => {
  const policy = new MeetupPolicy(meetup(status), userId);
  return { respond: policy.canRespond, cancel: policy.canCancel, plan: policy.canPlan, comment: policy.canComment };
};

describe("meetup policy", () => {
  it("lets the organizer plan and cancel a proposal, and a guest only answer", () => {
    expect(allowed("proposed", "organizer")).toEqual({ respond: false, cancel: true, plan: true, comment: true });
    expect(allowed("proposed", "guest")).toEqual({ respond: true, cancel: false, plan: false, comment: true });
  });
  it("stops planning once a time is confirmed, while answers stay open", () => {
    expect(allowed("confirmed", "organizer")).toEqual({ respond: false, cancel: true, plan: false, comment: true });
    expect(allowed("confirmed", "guest").respond).toBe(true);
  });
  it("closes a canceled or finished meetup", () => {
    expect(allowed("canceled", "organizer")).toEqual({ respond: false, cancel: false, plan: false, comment: false });
    expect(allowed("canceled", "guest")).toEqual({ respond: false, cancel: false, plan: false, comment: false });
    expect(allowed("completed", "guest")).toEqual({ respond: false, cancel: false, plan: false, comment: true });
  });
});

describe("what meetups say about friends", () => {
  const now = new Date(2026, 9, 7, 14, 0);
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
  const confirmed = (id: string, startHours: number, fields: Partial<MeetupSummary> = {}): MeetupSummary =>
    ({ ...meetup("confirmed"), id, title: "Ăn tối", startAt: at(startHours), endAt: at(startHours + 2), rsvp: "going", ...fields });

  it("counts a confirmed meetup from two days before it starts until it ends, unless the user declined", () => {
    expect(isSoon(confirmed("m", 4), now)).toBe(true);
    expect(isSoon(confirmed("m", -1), now)).toBe(true);
    expect(isSoon(confirmed("m", 49), now)).toBe(false);
    expect(isSoon(confirmed("m", -3), now)).toBe(false);
    expect(isSoon(confirmed("m", 4, { rsvp: "declined" }), now)).toBe(false);
    expect(isSoon({ ...confirmed("m", 4), status: "proposed" }, now)).toBe(false);
  });
  it("names everyone in a meetup that is soon, stronger the nearer it is, and never the user", () => {
    const signals = meetupSignals([confirmed("m1", 4), confirmed("m2", 30, { organizerId: "me" })], new Map([["m1", ["me", "lan"]], ["m2", ["kha"]]]), "me", now);
    expect(signals).toEqual([
      { userId: "organizer", kind: "meetup", strength: 1 - 4 / 48, label: "Hẹn 18:00 hôm nay · Ăn tối", to: "/meetups/m1" },
      { userId: "lan", kind: "meetup", strength: 1 - 4 / 48, label: "Hẹn 18:00 hôm nay · Ăn tối", to: "/meetups/m1" },
      { userId: "kha", kind: "meetup", strength: 1 - 30 / 48, label: "Hẹn 20:00 mai · Ăn tối", to: "/meetups/m2" },
    ]);
    expect(meetupSignals([confirmed("m3", -1)], new Map(), "me", now)[0]).toMatchObject({ strength: 1, label: "Đang diễn ra · Ăn tối" });
    expect(meetupSignals([confirmed("m4", 47)], new Map(), "me", now)[0].strength).toBe(0.25);
  });
  it("names the organizer of a proposal that waits for the user's answer", () => {
    const proposal = { ...meetup("proposed"), id: "p1", title: "Cà phê" };
    expect(meetupSignals([proposal], new Map(), "me", now)).toEqual([{ userId: "organizer", kind: "invite", strength: 1, label: "Đang rủ bạn: Cà phê", to: "/meetups/p1" }]);
    expect(meetupSignals([{ ...proposal, rsvp: "going" }], new Map(), "me", now)).toEqual([]);
    expect(meetupSignals([proposal], new Map(), "organizer", now)).toEqual([]);
  });
});
