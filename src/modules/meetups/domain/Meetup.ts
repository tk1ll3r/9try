import type { FriendSignal } from "../../../kernel/module";

export type MeetupStatus = "draft" | "proposed" | "confirmed" | "canceled" | "completed";
export type Rsvp = "pending" | "going" | "maybe" | "declined";

/** A meetup the signed-in user organizes or is invited to, with their own answer. */
export interface MeetupSummary {
  id: string;
  groupId: string | null;
  organizerId: string;
  title: string;
  description: string;
  status: MeetupStatus;
  startAt: string | null;
  endAt: string | null;
  capacity: number | null;
  locationName: string | null;
  rsvp: Rsvp;
}

export interface PollOption {
  optionId: string;
  startsAt: string;
  endsAt: string;
  availableCount: number;
  totalVotes: number;
  myVote: boolean | null;
}

export interface MeetupComment {
  id: string;
  body: string;
  createdAt: string;
  authorDisplayName: string;
}

export interface MeetupParticipant {
  userId: string;
  displayName: string;
  rsvp: Rsvp;
}

/** What one person may do with a meetup in its current status. The server checks the same rules again. */
export class MeetupPolicy {
  constructor(private readonly meetup: MeetupSummary, private readonly userId: string) {}

  private get organizer(): boolean {
    return this.meetup.organizerId === this.userId;
  }
  private get open(): boolean {
    return this.meetup.status !== "canceled" && this.meetup.status !== "completed";
  }

  /** Answer going, maybe or no. The organizer is going by definition. */
  get canRespond(): boolean {
    return this.open && !this.organizer;
  }
  get canCancel(): boolean {
    return this.open && this.organizer;
  }
  /** Propose times, invite people and confirm one time, until a time is confirmed. */
  get canPlan(): boolean {
    return this.organizer && this.meetup.status === "proposed";
  }
  get canComment(): boolean {
    return this.meetup.status !== "canceled";
  }
}

export interface MeetupRepository {
  list(): Promise<MeetupSummary[]>;
  /** A meetup in a group invites every other member of that group. */
  create(meetup: { groupId: string | null; title: string; description: string; capacity: number | null }): Promise<string>;
  /** Invites the chosen friends and returns how many were newly invited. */
  invite(meetupId: string, userIds: string[]): Promise<number>;
  participants(meetupId: string): Promise<MeetupParticipant[]>;
  respond(meetupId: string, response: Exclude<Rsvp, "pending">): Promise<void>;
  addOption(meetupId: string, startsAt: Date, endsAt: Date): Promise<void>;
  poll(meetupId: string): Promise<PollOption[]>;
  vote(optionId: string, available: boolean): Promise<void>;
  confirm(meetupId: string, optionId: string): Promise<void>;
  cancel(meetupId: string): Promise<void>;
  comments(meetupId: string): Promise<MeetupComment[]>;
  postComment(meetupId: string, body: string): Promise<void>;
}

const hour = 3_600_000;

/**
 * What the user's meetups add up to: the ones with a set time in the last `days` days that they did
 * not decline, the ones still to come, and the invitations that wait for their answer.
 */
export function meetupStats(meetups: readonly MeetupSummary[], userId: string, days: number, now = new Date()): { went: number; coming: number; waiting: number } {
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1)).getTime();
  const set = meetups.filter(meetup => (meetup.status === "confirmed" || meetup.status === "completed") && meetup.rsvp !== "declined" && meetup.startAt);
  return {
    went: set.filter(meetup => Date.parse(meetup.startAt!) >= since && Date.parse(meetup.startAt!) <= now.getTime()).length,
    coming: set.filter(meetup => Date.parse(meetup.startAt!) > now.getTime()).length,
    waiting: meetups.filter(meetup => meetup.organizerId !== userId && meetup.rsvp === "pending" && (meetup.status === "proposed" || meetup.status === "confirmed")).length,
  };
}

/** Confirmed, not declined, and starting within 48 hours or still going on. */
export function isSoon(meetup: MeetupSummary, now: Date): boolean {
  if (meetup.status !== "confirmed" || meetup.rsvp === "declined" || !meetup.startAt) return false;
  const start = Date.parse(meetup.startAt), end = meetup.endAt ? Date.parse(meetup.endAt) : start + 2 * hour;
  return end > now.getTime() && start - now.getTime() < 48 * hour;
}

function whenLabel(startAt: string, now: Date): string {
  const start = new Date(startAt);
  if (start.getTime() <= now.getTime()) return "Đang diễn ra";
  const days = Math.round((new Date(start).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / (24 * hour));
  return `Hẹn ${start.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${days === 0 ? "hôm nay" : days === 1 ? "mai" : "ngày kia"}`;
}

/**
 * What meetups say about friends: everyone in a meetup that is soon, stronger the nearer it is, and
 * the organizer of a proposal that still waits for the user's answer. `goingByMeetup` lists, per
 * meetup id, the invited people who have not declined; the organizer counts either way.
 */
export function meetupSignals(meetups: readonly MeetupSummary[], goingByMeetup: ReadonlyMap<string, readonly string[]>, userId: string, now: Date): FriendSignal[] {
  return meetups.flatMap(meetup => {
    const to = `/meetups/${meetup.id}`;
    if (meetup.status === "proposed" && meetup.rsvp === "pending" && meetup.organizerId !== userId) {
      return [{ userId: meetup.organizerId, kind: "invite", strength: 1, label: `Đang rủ bạn: ${meetup.title}`, to }];
    }
    if (!isSoon(meetup, now)) return [];
    const hoursLeft = Math.max(0, (Date.parse(meetup.startAt!) - now.getTime()) / hour);
    const signal = { kind: "meetup", strength: Math.max(0.25, 1 - hoursLeft / 48), label: `${whenLabel(meetup.startAt!, now)} · ${meetup.title}`, to };
    const people = new Set([meetup.organizerId, ...(goingByMeetup.get(meetup.id) ?? [])]);
    people.delete(userId);
    return [...people].map(id => ({ userId: id, ...signal }));
  });
}
