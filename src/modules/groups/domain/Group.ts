export type GroupRole = "owner" | "admin" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  role: GroupRole;
  memberCount: number;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  role: GroupRole;
  joinedAt: string;
}

/** An invite link that can still be used. The link itself is only shown when it is created. */
export interface GroupInvite {
  id: string;
  expiresAt: string;
  usesLeft: number;
}

/**
 * What one member may do in a group. The database enforces the same rules;
 * this class only decides which buttons to show.
 */
export class Membership {
  constructor(private readonly me: GroupMember | undefined) {}

  get isOwner() { return this.me?.role === "owner"; }
  get isAdmin() { return this.me?.role === "owner" || this.me?.role === "admin"; }
  /** The owner has to hand the group over before leaving. */
  get canLeave() { return !!this.me && !this.isOwner; }

  canRemove(target: GroupMember) {
    if (!this.isAdmin || target.userId === this.me?.userId || target.role === "owner") return false;
    return this.isOwner || target.role === "member";
  }

  /** Only the owner changes roles or hands the group over, and never for themselves. */
  canManageRole(target: GroupMember) {
    return this.isOwner && target.role !== "owner";
  }
}

/** The signed-in user's groups. */
export interface GroupRepository {
  list(): Promise<GroupSummary[]>;
  members(groupId: string): Promise<GroupMember[]>;
  create(name: string, description: string): Promise<void>;
  createInvite(groupId: string, maxUses: number): Promise<{ token: string; expiresAt: string }>;
  listInvites(groupId: string): Promise<GroupInvite[]>;
  revokeInvite(inviteId: string): Promise<void>;
  claimInvite(token: string): Promise<string>;
  transferOwnership(groupId: string, newOwnerId: string): Promise<void>;
  setRole(groupId: string, userId: string, role: "admin" | "member"): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  leave(groupId: string): Promise<void>;
  archive(groupId: string): Promise<void>;
  /** Whether the user lets this group's members see their busy times. */
  sharesAvailability(groupId: string): Promise<boolean>;
  setAvailabilityShare(groupId: string, enabled: boolean): Promise<void>;
}
