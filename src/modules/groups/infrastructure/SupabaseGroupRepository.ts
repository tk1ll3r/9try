import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupInvite, GroupMember, GroupRepository, GroupSummary } from "../domain/Group";

export class SupabaseGroupRepository implements GroupRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(): Promise<GroupSummary[]> {
    const { data, error } = await this.db
      .from("group_memberships")
      .select("role,group:groups(id,name,description,member_count,archived_at)")
      .eq("user_id", this.userId)
      .order("joined_at", { ascending: false });
    if (error) throw error;

    return (data ?? []).flatMap((row: any) => {
      const group = Array.isArray(row.group) ? row.group[0] : row.group;
      if (!group || group.archived_at) return [];
      return [{ id: group.id, name: group.name, description: group.description ?? "", role: row.role, memberCount: group.member_count ?? 1 }];
    });
  }

  async members(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await this.db.rpc("list_group_members", { p_group_id: groupId });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      userId: row.user_id,
      displayName: row.display_name || row.username || "Người dùng",
      username: row.username,
      avatarUrl: row.avatar_url,
      role: row.role,
      joinedAt: row.joined_at,
    }));
  }

  create(name: string, description: string) { return this.call("create_group", { p_name: name.trim(), p_description: description.trim() }); }
  revokeInvite(inviteId: string) { return this.call("revoke_group_invite", { p_invite_id: inviteId }); }
  transferOwnership(groupId: string, newOwnerId: string) { return this.call("transfer_group_ownership", { p_group_id: groupId, p_new_owner_id: newOwnerId }); }
  setRole(groupId: string, userId: string, role: "admin" | "member") { return this.call("set_group_member_role", { p_group_id: groupId, p_user_id: userId, p_role: role }); }
  removeMember(groupId: string, userId: string) { return this.call("remove_group_member", { p_group_id: groupId, p_user_id: userId }); }
  leave(groupId: string) { return this.call("leave_group", { p_group_id: groupId }); }
  archive(groupId: string) { return this.call("archive_group", { p_group_id: groupId }); }
  setAvailabilityShare(groupId: string, enabled: boolean) { return this.call("set_group_availability_share", { p_group_id: groupId, p_enabled: enabled }); }

  async createInvite(groupId: string, maxUses: number) {
    const { data, error } = await this.db.rpc("create_group_invite", { p_group_id: groupId, p_expires_minutes: 10080, p_max_uses: maxUses });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Không tạo được liên kết mời.");
    return { token: row.token as string, expiresAt: row.expires_at as string };
  }

  async listInvites(groupId: string): Promise<GroupInvite[]> {
    const { data, error } = await this.db.from("group_invites")
      .select("id,expires_at,max_uses,use_count")
      .eq("group_id", groupId).is("revoked_at", null).gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({ id: row.id, expiresAt: row.expires_at, usesLeft: row.max_uses - row.use_count })).filter(invite => invite.usesLeft > 0);
  }

  async claimInvite(token: string): Promise<string> {
    const { data, error } = await this.db.rpc("claim_group_invite", { p_token: token });
    if (error) throw error;
    return data as string;
  }

  async sharesAvailability(groupId: string): Promise<boolean> {
    const { data, error } = await this.db.from("availability_shares").select("id").eq("owner_id", this.userId).eq("group_id", groupId);
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  private async call(name: string, args: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc(name, args);
    if (error) throw error;
  }
}
