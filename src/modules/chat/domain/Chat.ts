import type { FriendSignal } from "../../../kernel/module";

export interface Conversation {
  id: string;
  kind: "direct" | "group";
  /** The other person's name, or the group's name. */
  title: string;
  /** The other person in a direct conversation. */
  otherUserId: string | null;
  /** Messages of the last 14 days. 0 on a database that does not count them yet. */
  recentMessages: number;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unreadCount: number;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  /** Shown already, but the server has not confirmed it yet. */
  pending?: boolean;
}

export const messagePageSize = 50;

/** The signed-in user's conversations. */
export interface ChatRepository {
  conversations(): Promise<Conversation[]>;
  /** One page of messages, newest first, older than `before` when given. */
  messages(conversationId: string, before?: string): Promise<ChatMessage[]>;
  /** `id` is made by the caller, so sending again after a lost reply cannot post twice. */
  send(id: string, conversationId: string, body: string): Promise<void>;
  markRead(conversationId: string): Promise<void>;
  /** The id of the conversation with a friend, created on first use. */
  openDirect(userId: string): Promise<string>;
  openGroup(groupId: string): Promise<string>;
}

const day = 86_400_000;

/**
 * What direct conversations say about friends: unread messages, and how much and how lately two people talk.
 * Sixty messages in two weeks count as "talks a lot"; a last message older than a week no longer counts as recent.
 */
export function chatSignals(conversations: readonly Conversation[], now: Date): FriendSignal[] {
  return conversations.flatMap(conversation => {
    if (conversation.kind !== "direct" || !conversation.otherUserId) return [];
    const userId = conversation.otherUserId, to = `/chat/${conversation.id}`;
    const signals: FriendSignal[] = [];
    if (conversation.unreadCount > 0) {
      signals.push({ userId, kind: "unread", strength: Math.min(conversation.unreadCount, 5) / 5, label: `${conversation.unreadCount} tin chưa đọc`, to });
    }
    const age = conversation.lastMessageAt ? now.getTime() - Date.parse(conversation.lastMessageAt) : Infinity;
    const recency = age < day ? 1 : Math.max(0, 1 - (age - day) / (6 * day));
    const volume = Math.min(1, Math.log2(1 + conversation.recentMessages) / Math.log2(61));
    const strength = 0.7 * volume + 0.3 * recency;
    if (strength > 0) {
      const label = conversation.recentMessages >= 20 ? "Hay trò chuyện" : age < day ? "Nhắn hôm nay" : age < 2 * day ? "Nhắn hôm qua" : undefined;
      signals.push({ userId, kind: "chat", strength, label, to });
    }
    return signals;
  });
}
