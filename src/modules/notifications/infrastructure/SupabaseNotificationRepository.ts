import { requireSupabase } from "../../../shared/infrastructure/supabase";
import { safeReturnPath } from "../../auth/domain/login";

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  action_path: string | null;
}

// Database text is not a trusted navigation target. Only known in-app routes are actionable.
export function notificationDestination(path: string | null): string | null {
  if (!path) return null;
  const safe = safeReturnPath(path);
  return safe !== "/" || path === "/" ? safe : null;
}

export class NotificationsData {
  async list(userId: string, from = 0, pageSize = 20): Promise<NotificationRow[]> {
    const { data, error } = await requireSupabase().from("notifications")
      .select("id,title,body,read_at,created_at,action_path")
      .eq("user_id", userId).order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return data ?? [];
  }

  async markRead(userId: string, id: string): Promise<void> {
    const { error } = await requireSupabase().from("notifications")
      .update({ read_at: new Date().toISOString() }).eq("user_id", userId).eq("id", id).select("id").single();
    if (error) throw error;
  }
}

export const notificationsData = new NotificationsData();
