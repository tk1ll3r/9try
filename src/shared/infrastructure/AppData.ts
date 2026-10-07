import { requireSupabase } from "./supabase";
import { calendarData } from "../../features/calendars/infrastructure/CalendarData";
import { selectUpcoming } from "../../features/home/domain/upcoming";

export interface OwnedLocationSession {
  id: string;
  expires_at: string;
  approximate: boolean;
}

export interface VisibleLocation {
  sessionId: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerUsername: string | null;
  expiresAt: string;
  approximate: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  recordedAt: string | null;
}

export class AppData {
  /** Today's upcoming events and recent groups. Tasks load on their own in the tasks module. */
  async home(userId: string) {
    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 30);
    const [events, groups] = await Promise.all([
      calendarData.listOccurrences(userId, now, rangeEnd),
      requireSupabase().from("group_memberships").select("role,group:groups(id,name,description)").eq("user_id", userId).limit(6),
    ]);
    if (groups.error) throw groups.error;
    return { events: selectUpcoming(events, now).slice(0, 6), groups: groups.data ?? [] };
  }

  async profile(userId: string) {
    const { data, error } = await requireSupabase().from("profiles").select("*").eq("id", userId).single();
    if (error) throw error;
    return data;
  }

  async saveProfile(userId: string, value: { display_name: string; username: string; bio: string; timezone: string }) {
    const { error } = await requireSupabase().from("profiles").update(value).eq("id", userId);
    if (error) throw error;
  }

  async startLocation(duration: number, usernames: string[], approximate: boolean) {
    const { data, error } = await requireSupabase().rpc("start_location_session", {
      p_duration_minutes: duration,
      p_recipient_usernames: usernames,
      p_approximate: approximate,
    });
    if (error) throw error;
    return data as string;
  }

  async publishLocation(sessionId: string, position: GeolocationPosition, approximate: boolean) {
    const latitude = approximate ? Math.round(position.coords.latitude * 1000) / 1000 : position.coords.latitude;
    const longitude = approximate ? Math.round(position.coords.longitude * 1000) / 1000 : position.coords.longitude;
    const accuracy = approximate ? Math.max(100, position.coords.accuracy) : position.coords.accuracy;
    const { error } = await requireSupabase().from("location_positions").upsert({
      session_id: sessionId,
      latitude,
      longitude,
      accuracy_m: accuracy,
      recorded_at: new Date(position.timestamp).toISOString(),
    });
    if (error) throw error;
  }

  async listVisibleLocations(): Promise<VisibleLocation[]> {
    const { data, error } = await requireSupabase().rpc("list_visible_locations");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      sessionId: row.session_id,
      ownerId: row.owner_id,
      ownerDisplayName: row.owner_display_name || row.owner_username || "Người dùng",
      ownerUsername: row.owner_username,
      expiresAt: row.expires_at,
      approximate: row.approximate,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracy_m,
      recordedAt: row.recorded_at,
    }));
  }

  async listOwnedLocationSessions(userId: string): Promise<OwnedLocationSession[]> {
    const { data, error } = await requireSupabase().from("location_sessions")
      .select("id,expires_at,approximate").eq("owner_id", userId)
      .is("stopped_at", null).gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async stopLocation(id: string) {
    const { error } = await requireSupabase().rpc("stop_location_session", { p_session_id: id });
    if (error) throw error;
  }

  async exportMyData() {
    const { data, error } = await requireSupabase().rpc("export_my_data");
    if (error) throw error;
    return data;
  }

  async deleteMyAccount() {
    const { data, error } = await requireSupabase().functions.invoke("delete-account", { body: { confirm: true } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
  }
}

export const appData = new AppData();
