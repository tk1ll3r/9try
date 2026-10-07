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

  async markRead(id: string): Promise<void> {
    const { error } = await this.db.from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("user_id", this.userId).eq("id", id).select("id").single();
    if (error) throw error;
  }
}
