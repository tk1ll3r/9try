export interface FriendConnection {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined" | "canceled";
  createdAt: string;
}

/** A time when a friend is busy. Titles and places never leave the owner. */
export interface BusyRange {
  eventKind: "timed" | "all_day";
  startAt: string | null;
  endAt: string | null;
  allDayStart: string | null;
  allDayEndExclusive: string | null;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  username: string | null;
}

/** The signed-in user's connections. Every method acts as that user. */
export interface FriendRepository {
  list(): Promise<FriendConnection[]>;
  sendRequest(username: string): Promise<void>;
  respond(requesterId: string, accept: boolean): Promise<void>;
  cancelRequest(addresseeId: string): Promise<void>;
  remove(otherId: string): Promise<void>;
  block(otherId: string): Promise<void>;
  unblock(otherId: string): Promise<void>;
  listBlocked(): Promise<BlockedUser[]>;
  /** A new personal link token. Any earlier link stops working. */
  createInvite(): Promise<{ token: string; expiresAt: string }>;
  claimInvite(token: string): Promise<void>;
  /** Ids of the friends who may see this user's busy times. */
  availabilitySharedWith(): Promise<Set<string>>;
  setAvailabilityShare(otherId: string, enabled: boolean): Promise<void>;
  busyFor(otherId: string, from: Date, to: Date): Promise<BusyRange[]>;
}
