import { useConversations } from "./useChat";

/** Unread messages across all conversations, shown on the chat tab. */
export function ChatUnreadBadge() {
  const count = (useConversations().data ?? []).reduce((sum, conversation) => sum + conversation.unreadCount, 0);
  if (!count) return null;
  return <span aria-label={`${count} tin nhắn chưa đọc`} className="absolute -right-2 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4.5 text-white">{count > 9 ? "9+" : count}</span>;
}
