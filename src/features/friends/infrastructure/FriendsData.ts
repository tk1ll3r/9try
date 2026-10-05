import { requireSupabase } from "../../../shared/infrastructure/supabase";

export interface FriendConnection {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined" | "canceled";
  createdAt: string;
}

export class FriendsData {
  async list(): Promise<FriendConnection[]> {
    const { data, error } = await requireSupabase().rpc("list_friend_connections");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      userId: row.user_id,
      displayName: row.display_name || row.username || "Người dùng",
      username: row.username,
      avatarUrl: row.avatar_url,
      direction: row.direction,
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  async send(username: string): Promise<void> {
    const { error } = await requireSupabase().rpc("send_friend_request", { p_username: username.trim() });
    if (error) throw error;
  }

  async respond(requesterId: string, accept: boolean): Promise<void> {
    const { error } = await requireSupabase().rpc("respond_friend_request", {
      p_requester_id: requesterId,
      p_accept: accept,
    });
    if (error) throw error;
  }

  async remove(otherId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("remove_friend", { p_other_id: otherId });
    if (error) throw error;
  }
}

export const friendsData = new FriendsData();
