import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { Card } from "../../../kernel/ui/Card";
import { StatTile } from "../../../kernel/ui/Stat";
import { useConversations } from "./useChat";

/**
 * The statistics card of chat: how much was said, and with whom most. The server counts the messages
 * of the last 14 days for each conversation, so this card keeps to 14 days whatever period is chosen.
 */
export function ChatStatsCard() {
  const conversations = useConversations();
  const all = conversations.data ?? [];
  const busiest = all.filter(conversation => conversation.recentMessages > 0).sort((a, b) => b.recentMessages - a.recentMessages).slice(0, 4);
  const total = all.reduce((sum, conversation) => sum + conversation.recentMessages, 0);
  return <Card title="Trò chuyện · 14 ngày qua" action={<Link to="/chat" className="text-sm font-semibold underline">Mở trò chuyện</Link>}>
    {conversations.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(conversations.error, "Không tải được các cuộc trò chuyện.")}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={total} label="tin nhắn" />
        <StatTile value={all.length} label="cuộc trò chuyện" />
        <StatTile value={all.reduce((sum, conversation) => sum + conversation.unreadCount, 0)} label="tin chưa đọc" />
      </div>
      {busiest.length > 0 && <>
        <p className="mb-2 mt-4 text-xs font-bold text-[var(--muted)]">Trò chuyện nhiều nhất</p>
        <ul className="space-y-3">
          {busiest.map(conversation => <li key={conversation.id}>
            <p className="flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold">{conversation.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{conversation.recentMessages} tin</span></p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--soft)]"><i className="block h-full rounded-full bg-[var(--tone-class)]" style={{ width: `${conversation.recentMessages / busiest[0].recentMessages * 100}%` }} /></div>
          </li>)}
        </ul>
      </>}
    </>}
  </Card>;
}
