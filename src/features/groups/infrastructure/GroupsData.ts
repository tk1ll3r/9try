import { requireSupabase } from "../../../shared/infrastructure/supabase";

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export class GroupsData {
  async list(userId: string): Promise<GroupSummary[]> {
    const { data, error } = await requireSupabase()
      .from("group_memberships")
      .select("role,group:groups(id,name,description,member_count,archived_at)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });
    if (error) throw error;

    return (data ?? []).flatMap((row: any) => {
      const group = Array.isArray(row.group) ? row.group[0] : row.group;
      if (!group || group.archived_at) return [];
      return [{
        id: group.id,
        name: group.name,
        description: group.description ?? "",
        role: row.role,
        memberCount: group.member_count ?? 1,
      }];
    });
  }

  async members(groupId: string): Promise<GroupMember[]> {
    const { data, error } = await requireSupabase().rpc("list_group_members", { p_group_id: groupId });
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

  async create(name: string, description: string): Promise<void> {
    const { error } = await requireSupabase().rpc("create_group", {
      p_name: name.trim(),
      p_description: description.trim(),
    });
    if (error) throw error;
  }

  async createInvite(groupId: string, maxUses = 1, expiresMinutes = 10080): Promise<{ token: string; expiresAt: string }> {
    const { data, error } = await requireSupabase().rpc("create_group_invite", {
      p_group_id: groupId,
      p_expires_minutes: expiresMinutes,
      p_max_uses: maxUses,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Không tạo được liên kết mời.");
    return { token: row.token, expiresAt: row.expires_at };
  }

  async claim(token: string): Promise<string> {
    const { data, error } = await requireSupabase().rpc("claim_group_invite", { p_token: token });
    if (error) throw error;
    return data as string;
  }

  async transferOwnership(groupId: string, newOwnerId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_id: newOwnerId,
    });
    if (error) throw error;
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("remove_group_member", {
      p_group_id: groupId,
      p_user_id: userId,
    });
    if (error) throw error;
  }

  async leave(groupId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("leave_group", { p_group_id: groupId });
    if (error) throw error;
  }

  async archive(groupId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("archive_group", { p_group_id: groupId });
    if (error) throw error;
  }
}

export const groupsData = new GroupsData();
