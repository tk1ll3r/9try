import { ArrowLeft, MessageCircle, UsersRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { Thread } from "./Thread";
import { useConversations } from "./useChat";
import { t } from "../../../kernel/i18n";

/** Phone: the list, or one conversation. Desktop: both side by side. */
export function ChatPage() {
  const { conversationId } = useParams();
  const conversations = useConversations();
  const open = conversations.data?.find(conversation => conversation.id === conversationId);

  return (
    <div className="grid h-[calc(100dvh-8.5rem)] gap-5 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[20rem_1fr]">
      <section className={`min-h-0 flex-col ${conversationId ? "hidden lg:flex" : "flex"}`}>
        <header className="pr-14 lg:pr-0">
          <p className="text-sm font-semibold text-[var(--muted)]">{t("Với bạn bè và nhóm của bạn")}</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Trò chuyện")}</h1>
        </header>
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {conversations.isPending && <p role="status">{t("Đang tải…")}</p>}
          {conversations.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(conversations.error, t("Không tải được các cuộc trò chuyện."))}</p>}
          {conversations.data?.length === 0 && <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--muted)]">{t("Chưa có cuộc trò chuyện nào. Mở")} <Link className="font-semibold underline" to="/me/friends">{t("Bạn bè")}</Link> {t("và bấm “Nhắn tin”, hoặc mở một nhóm và bấm “Trò chuyện nhóm”.")}</p>}
          {(conversations.data ?? []).map(conversation => (
            <Link key={conversation.id} to={`/chat/${conversation.id}`} aria-current={conversation.id === conversationId ? "page" : undefined}
              className={`flex min-h-16 items-center gap-3 rounded-2xl p-3 ${conversation.id === conversationId ? "bg-[var(--soft)]" : "bg-[var(--surface)] hover:bg-[var(--soft)]"}`}>
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">
                {conversation.kind === "group" ? <UsersRound size={18} /> : conversation.title.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{conversation.title}</span>
                <span className="block truncate text-sm text-[var(--muted)]">{conversation.lastMessageBody ?? t("Chưa có tin nhắn")}</span>
              </span>
              {conversation.unreadCount > 0 && <span aria-label={t("{0} tin chưa đọc", conversation.unreadCount)} className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-6 text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}
            </Link>
          ))}
        </div>
      </section>

      <section className={`min-h-0 flex-col rounded-[28px] border border-black/8 bg-[var(--surface)] p-4 dark:border-white/8 ${conversationId ? "flex" : "hidden lg:flex"}`}>
        {conversationId ? <>
          <header className="flex items-center gap-2 border-b border-black/8 pb-3 pr-12 lg:pr-0 dark:border-white/8">
            <Link to="/chat" aria-label={t("Về danh sách trò chuyện")} className="grid size-11 place-items-center rounded-xl hover:bg-[var(--soft)] lg:hidden"><ArrowLeft size={18} /></Link>
            <h2 className="truncate text-lg font-bold">{open?.title ?? t("Cuộc trò chuyện")}</h2>
          </header>
          <Thread key={conversationId} conversationId={conversationId} showNames={open?.kind === "group"} />
        </> : <div className="m-auto text-center text-[var(--muted)]"><MessageCircle className="mx-auto mb-2" />{t("Chọn một cuộc trò chuyện.")}</div>}
      </section>
    </div>
  );
}
