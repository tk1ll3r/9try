import { requireSupabase } from "./supabase";
import { calendarData } from "../../features/calendars/infrastructure/CalendarData";
import { localDateKey, selectUpcoming } from "../../features/home/domain/upcoming";

export interface OneTimeTask {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  due_at: string | null;
  completed_at: string | null;
}

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
  async home(userId: string) {
    const db = requireSupabase();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);
    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 30);
    const [events, t, g, n] = await Promise.all([
      calendarData.listOccurrences(userId, now, rangeEnd),
      db.from("personal_tasks").select("id,title,priority,due_at,completed_at").eq("owner_id", userId).is("completed_at", null).eq("recurrence", "none").or(`due_at.is.null,due_at.lt.${tomorrow.toISOString()}`).order("due_at", { ascending: true, nullsFirst: false }).limit(50),
      db.from("group_memberships").select("role,group:groups(id,name,description)").eq("user_id", userId).limit(6),
      db.from("notifications").select("id,title,body,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);
    for (const result of [t, g, n]) if (result.error) throw result.error;
    return { events: selectUpcoming(events, now).slice(0, 6), tasks: t.data ?? [], groups: g.data ?? [], notifications: n.data ?? [] };
  }

  async createTask(userId: string, title: string, dueDate?: string, priority: "low" | "medium" | "high" = "medium") {
    const dueAt = dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null;
    const { error } = await requireSupabase().from("personal_tasks").insert({ owner_id: userId, title: title.trim(), priority, due_at: dueAt });
    if (error) throw error;
  }

  async listTasks(userId: string): Promise<OneTimeTask[]> {
    const { data, error } = await requireSupabase().from("personal_tasks")
      .select("id,title,priority,due_at,completed_at").eq("owner_id", userId)
      .eq("recurrence", "none").order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return data ?? [];
  }

  async setTaskCompleted(userId: string, id: string, completed: boolean) {
    const completedAt = completed ? new Date().toISOString() : null;
    const { error } = await requireSupabase().from("personal_tasks")
      .update({ completed_at: completedAt })
      .eq("id", id).eq("owner_id", userId).eq("recurrence", "none").select("id").single();
    if (error) throw error;
    return completedAt;
  }

  async undoTaskCompletion(userId: string, id: string, completedAt: string) {
    const { error } = await requireSupabase().from("personal_tasks").update({ completed_at: null })
      .eq("id", id).eq("owner_id", userId).eq("recurrence", "none")
      .eq("completed_at", completedAt).select("id").single();
    if (error) throw new Error("Việc đã thay đổi hoặc không thể hoàn tác. Hãy tải lại danh sách.");
  }

  async updateTask(userId: string, id: string, title: string, dueDate: string, priority: OneTimeTask["priority"], originalDue: string | null = null) {
    if (!title.trim()) throw new Error("Hãy nhập tên công việc.");
    const { error } = await requireSupabase().from("personal_tasks").update({
      title: title.trim(), priority,
      due_at: originalDue && localDateKey(new Date(originalDue)) === dueDate
        ? originalDue : dueDate ? new Date(`${dueDate}T23:59:00`).toISOString() : null,
    }).eq("id", id).eq("owner_id", userId).eq("recurrence", "none").select("id").single();
    if (error) throw error;
  }

  async deleteTask(userId: string, id: string) {
    const { error } = await requireSupabase().from("personal_tasks").delete()
      .eq("id", id).eq("owner_id", userId).eq("recurrence", "none").select("id").single();
    if (error) throw error;
  }

  async createGroup(name: string, description: string) {
    const { error } = await requireSupabase().rpc("create_group", { p_name: name, p_description: description });
    if (error) throw error;
  }

  async createEvent(userId: string, title: string, startAt: string, endAt: string) {
    const { error } = await requireSupabase().from("calendar_events").insert({
      owner_id: userId,
      title,
      event_kind: "timed",
      start_at: startAt,
      end_at: endAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: "only_me",
    });
    if (error) throw error;
  }

  async markRead(id: string) {
    const { error } = await requireSupabase().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
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
