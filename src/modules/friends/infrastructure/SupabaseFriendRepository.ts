import type { SupabaseClient } from "@supabase/supabase-js";
import type { BlockedUser, FriendConnection, FriendRepository } from "../domain/Friend";

/** Friend connections through SQL functions, which act as the signed-in user. */
export class SupabaseFriendRepository implements FriendRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<FriendConnection[]> {
    const { data, error } = await this.db.rpc("list_friend_connections");
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

  sendRequest(username: string) { return this.call("send_friend_request", { p_username: username.trim() }); }
  respond(requesterId: string, accept: boolean) { return this.call("respond_friend_request", { p_requester_id: requesterId, p_accept: accept }); }
  cancelRequest(addresseeId: string) { return this.call("cancel_friend_request", { p_addressee_id: addresseeId }); }
  remove(otherId: string) { return this.call("remove_friend", { p_other_id: otherId }); }
  block(otherId: string) { return this.call("block_user", { p_user_id: otherId }); }
  unblock(otherId: string) { return this.call("unblock_user", { p_user_id: otherId }); }
  claimInvite(token: string) { return this.call("claim_friend_invite", { p_token: token }); }
  setAvailabilityShare(otherId: string, enabled: boolean) { return this.call("set_user_availability_share", { p_user_id: otherId, p_enabled: enabled }); }

  async listBlocked(): Promise<BlockedUser[]> {
    const { data, error } = await this.db.rpc("list_blocked_users");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ userId: row.user_id, displayName: row.display_name || row.username || "Người dùng", username: row.username }));
  }

  async createInvite() {
    const { data, error } = await this.db.rpc("create_friend_invite");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Không tạo được liên kết kết bạn.");
    return { token: row.token as string, expiresAt: row.expires_at as string };
  }

  async availabilitySharedWith(): Promise<Set<string>> {
    const { data, error } = await this.db.from("availability_shares").select("user_id").not("user_id", "is", null);
    if (error) throw error;
    return new Set((data ?? []).map(row => row.user_id as string));
  }

  async pinned(): Promise<Set<string>> {
    const { data, error } = await this.db.from("friend_pins").select("friend_id");
    if (error) throw error;
    return new Set((data ?? []).map(row => row.friend_id as string));
  }

  setPinned(otherId: string, pinned: boolean) { return this.call("set_friend_pin", { p_friend_id: otherId, p_pinned: pinned }); }

  private async call(name: string, args: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.rpc(name, args);
    if (error) throw error;
  }
}
