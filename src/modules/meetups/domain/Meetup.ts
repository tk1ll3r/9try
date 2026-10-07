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
