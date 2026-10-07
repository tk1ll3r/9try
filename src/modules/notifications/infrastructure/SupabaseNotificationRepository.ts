import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification, NotificationRepository } from "../domain/Notification";

/** `notifications` rows of one user. */
export class SupabaseNotificationRepository implements NotificationRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(from: number, pageSize: number): Promise<AppNotification[]> {
    const { data, error } = await this.db.from("notifications")
      .select("id,title,body,read_at,created_at,action_path")
      .eq("user_id", this.userId).order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return (data ?? []).map(row => ({
      id: row.id, title: row.title, body: row.body, readAt: row.read_at, createdAt: row.created_at, actionPath: row.action_path,
    }));
  }

  async countUnread(): Promise<number> {
    const { count, error } = await this.db.from("notifications")
      .select("id", { count: "exact", head: true }).eq("user_id", this.userId).is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  }

  async markRead(id: string): Promise<void> {
    const { error } = await this.db.from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("user_id", this.userId).eq("id", id).select("id").single();
    if (error) throw error;
  }

  async markAllRead(): Promise<void> {
    const { error } = await this.db.from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("user_id", this.userId).is("read_at", null);
    if (error) throw error;
  }

  async scheduleReminder(reminder: { dueAt: Date; title: string; body: string; actionPath: string }): Promise<void> {
    const { error } = await this.db.rpc("schedule_personal_reminder", {
      p_due_at: reminder.dueAt.toISOString(), p_title: reminder.title.trim(), p_body: reminder.body.trim(), p_action_path: reminder.actionPath,
    });
    if (error) throw error;
  }
}
