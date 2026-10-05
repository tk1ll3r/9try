import { requireSupabase } from "../../../shared/infrastructure/supabase";

export interface GroupSummary {
  id: string;
  name: string;
  description: string;
  role: "owner" | "admin" | "member";
  memberCount: number;
}

export class GroupsData {
  async list(userId: string): Promise<GroupSummary[]> {
    const { data, error } = await requireSupabase()
      .from("group_memberships")
      .select("role,group:groups(id,name,description,member_count)")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });
    if (error) throw error;

    return (data ?? []).flatMap((row: any) => {
      const group = Array.isArray(row.group) ? row.group[0] : row.group;
      if (!group) return [];
      return [{
        id: group.id,
        name: group.name,
        description: group.description ?? "",
        role: row.role,
        memberCount: group.member_count ?? 1,
      }];
    });
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
}

export const groupsData = new GroupsData();
