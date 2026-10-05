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

export interface BusyRange {
  eventKind: "timed" | "all_day";
  startAt: string | null;
  endAt: string | null;
  allDayStart: string | null;
  allDayEndExclusive: string | null;
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

  async cancel(addresseeId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("cancel_friend_request", { p_addressee_id: addresseeId });
    if (error) throw error;
  }

  async remove(otherId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("remove_friend", { p_other_id: otherId });
    if (error) throw error;
  }

  async block(otherId: string): Promise<void> {
    const { error } = await requireSupabase().rpc("block_user", { p_user_id: otherId });
    if (error) throw error;
  }

  async setAvailabilityShare(otherId: string, enabled: boolean): Promise<void> {
    const { error } = await requireSupabase().rpc("set_user_availability_share", {
      p_user_id: otherId,
      p_enabled: enabled,
    });
    if (error) throw error;
  }

  async myAvailabilityShares(): Promise<Set<string>> {
    const { data, error } = await requireSupabase()
      .from("availability_shares")
      .select("user_id")
      .not("user_id", "is", null);
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.user_id as string));
  }

  async busyFor(otherId: string, from: Date, to: Date): Promise<BusyRange[]> {
    const { data, error } = await requireSupabase().rpc("get_shared_busy", {
      p_owner_id: otherId,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      eventKind: row.event_kind,
      startAt: row.start_at,
      endAt: row.end_at,
      allDayStart: row.all_day_start,
      allDayEndExclusive: row.all_day_end_exclusive,
    }));
  }
}

export const friendsData = new FriendsData();
