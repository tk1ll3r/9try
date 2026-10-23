import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedbackMessage, FeedbackRepository } from "../domain/Feedback";

export class SupabaseFeedbackRepository implements FeedbackRepository {
  constructor(private readonly db: SupabaseClient) {}

  async isRecipient() {
    const { data, error } = await this.db.rpc("is_feedback_recipient");
    if (error) throw error;
    return data === true;
  }

  async submit(message: string) {
    const { error } = await this.db.rpc("submit_admin_feedback", { p_message: message.trim() });
    if (error) throw error;
  }

  async inbox(): Promise<FeedbackMessage[]> {
    const { data, error } = await this.db.rpc("list_admin_feedback");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderUsername: row.sender_username ?? null,
      senderAvatarUrl: row.sender_avatar_url ?? null,
      message: row.message,
      createdAt: row.created_at,
      readAt: row.read_at ?? null,
    }));
  }

  async markRead(id: string) {
    const { error } = await this.db.rpc("mark_admin_feedback_read", { p_feedback_id: id });
    if (error) throw error;
  }
}
