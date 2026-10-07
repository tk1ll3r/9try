import { describe, expect, it } from "vitest";
import { Membership, type GroupMember } from "./domain/Group";

const member = (userId: string, role: GroupMember["role"]): GroupMember => ({ userId, role, displayName: userId, username: null, avatarUrl: null, joinedAt: "" });
const owner = member("owner", "owner"), admin = member("admin", "admin"), other = member("other", "member");

describe("group membership rules", () => {
  it("lets only the owner change roles, and never the owner's own", () => {
    expect(new Membership(owner).canManageRole(other)).toBe(true);
    expect(new Membership(owner).canManageRole(owner)).toBe(false);
    expect(new Membership(admin).canManageRole(other)).toBe(false);
  });
  it("lets admins remove members but not each other, themselves or the owner", () => {
    expect(new Membership(admin).canRemove(other)).toBe(true);
    expect(new Membership(admin).canRemove(member("admin2", "admin"))).toBe(false);
    expect(new Membership(admin).canRemove(admin)).toBe(false);
    expect(new Membership(admin).canRemove(owner)).toBe(false);
    expect(new Membership(owner).canRemove(admin)).toBe(true);
    expect(new Membership(other).canRemove(admin)).toBe(false);
  });
  it("keeps the owner from leaving before handing the group over", () => {
    expect(new Membership(owner).canLeave).toBe(false);
    expect(new Membership(other).canLeave).toBe(true);
    expect(new Membership(undefined).canLeave).toBe(false);
  });
});
