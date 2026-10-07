import { describe, expect, it } from "vitest";
import { MeetupPolicy, type MeetupStatus, type MeetupSummary } from "./domain/Meetup";

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
