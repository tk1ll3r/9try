export interface Conversation {
  id: string;
  kind: "direct" | "group";
  /** The other person's name, or the group's name. */
  title: string;
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
