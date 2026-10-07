import type { SupabaseClient } from "@supabase/supabase-js";
import { messagePageSize, type ChatMessage, type ChatRepository, type Conversation } from "../domain/Chat";

/** Chat through SQL functions, which check on every call that the user takes part. */
export class SupabaseChatRepository implements ChatRepository {
  constructor(private readonly db: SupabaseClient) {}

  async conversations(): Promise<Conversation[]> {
    const { data, error } = await this.db.rpc("list_conversations");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: row.id, kind: row.kind, title: row.title, otherUserId: row.other_user_id ?? null, recentMessages: row.recent_messages ?? 0, lastMessageAt: row.last_message_at,
      lastMessageBody: row.last_message_body, unreadCount: row.unread_count ?? 0,
    }));
  }

  async messages(conversationId: string, before?: string): Promise<ChatMessage[]> {
    const { data, error } = await this.db.rpc("list_messages", { p_conversation_id: conversationId, p_before: before ?? null, p_limit: messagePageSize });
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ id: row.id, senderId: row.sender_id, senderName: row.sender_name, body: row.body, createdAt: row.created_at }));
  }

  async send(id: string, conversationId: string, body: string): Promise<void> {
    const { error } = await this.db.rpc("send_message", { p_id: id, p_conversation_id: conversationId, p_body: body });
    if (error) throw error;
  }

  async markRead(conversationId: string): Promise<void> {
    const { error } = await this.db.rpc("mark_conversation_read", { p_conversation_id: conversationId });
    if (error) throw error;
  }

  async openDirect(userId: string): Promise<string> {
    const { data, error } = await this.db.rpc("open_direct_conversation", { p_user_id: userId });
    if (error) throw error;
    return data as string;
  }

  async openGroup(groupId: string): Promise<string> {
    const { data, error } = await this.db.rpc("open_group_conversation", { p_group_id: groupId });
    if (error) throw error;
    return data as string;
  }
}
