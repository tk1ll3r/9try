export interface FriendConnection {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined" | "canceled";
  createdAt: string;
}

export interface BlockedUser {
  userId: string;
  displayName: string;
  username: string | null;
}

/** A private inbox item for a mutual relationship proposal between the signed-in user and a friend. */
export interface RelationshipInvite {
  id: string;
  otherUserId: string;
  otherName: string;
  otherAvatarUrl: string | null;
  direction: "incoming" | "outgoing";
  relationship: string;
  createdAt: string;
}

/** A relationship both friends have accepted. */
export interface SharedRelationship {
  friendId: string;
  friendName: string;
  friendAvatarUrl: string | null;
  relationship: string;
  createdAt: string;
  /** Consecutive Vietnam calendar days with at least one direct message. */
  currentStreak: number;
  lastMessageAt: string | null;
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
  /** Ids of the friends the user pinned. Pins are private to the user. */
  pinned(): Promise<Set<string>>;
  setPinned(otherId: string, pinned: boolean): Promise<void>;
  relationshipInvites(): Promise<RelationshipInvite[]>;
  sharedRelationships(): Promise<SharedRelationship[]>;
  sendRelationshipInvite(friendId: string, relationship: string): Promise<string>;
  respondRelationshipInvite(inviteId: string, accept: boolean): Promise<void>;
  cancelRelationshipInvite(inviteId: string): Promise<void>;
}
