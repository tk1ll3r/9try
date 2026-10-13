import { Hourglass, Send, UsersRound } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { useConversations } from "./useChat";
import { t } from "../../../kernel/i18n";

/**
 * "Gửi vào trò chuyện" for something that has a screen of its own: a meetup, a friend's calendar, the
 * map, a person's photos. The person picks a conversation and lands in it with the thing attached as
 * a card, to send with a line of their own or without. `path` is a plain path of the app. Whether
 * the reader may open it is decided by the screen it leads to.
 */
export function ShareToChatButton({ path, title, className = "" }: { path: string; title: string; className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const conversations = useConversations();
  const usable = (conversations.data ?? []).filter(conversation => !conversation.closed);
  return <>
    <Button id="share-to-chat" variant="ghost" className={className} onClick={() => setOpen(true)}><Send size={16} /> {t("Gửi vào trò chuyện")}</Button>
    <DialogPanel open={open} onOpenChange={setOpen} size="sm" returnFocusId="share-to-chat" title={t("Gửi vào trò chuyện")} description={t("Chọn cuộc trò chuyện để gửi “{0}”. Bạn viết thêm một dòng rồi mới gửi.", title)}>
      {conversations.isPending && <p role="status">{t("Đang tải…")}</p>}
      {conversations.isSuccess && usable.length === 0 && <p className="text-sm text-[var(--muted)]">{t("Bạn chưa có cuộc trò chuyện nào. Mở Bạn bè và bấm “Nhắn tin” với một người trước.")}</p>}
      <ul className="max-h-80 space-y-1 overflow-y-auto">{usable.map(conversation => <li key={conversation.id}>
        <button type="button" onClick={() => navigate(`/chat/${conversation.id}?ref=${encodeURIComponent(path)}&title=${encodeURIComponent(title)}`)}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-left hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">{conversation.kind === "group" ? <UsersRound size={17} /> : conversation.kind === "room" ? <Hourglass size={17} /> : conversation.title.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate font-semibold">{conversation.title}</span>
        </button>
      </li>)}</ul>
    </DialogPanel>
  </>;
}
