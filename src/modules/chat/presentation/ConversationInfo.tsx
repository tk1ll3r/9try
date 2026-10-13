import { useQuery } from "@tanstack/react-query";
import { BellOff, BellRing, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { chatModule } from "../chat.module";
import type { Conversation } from "../domain/Chat";
import { chatKey } from "./useChat";
import { locale, t } from "../../../kernel/i18n";

const lengths: [minutes: number, label: string][] = [[60, t("1 giờ")], [480, t("8 giờ")], [0, t("Tới khi tôi bật lại")]];

/** What a person sets for one conversation, and where they look for an old message: notifications off for a while, and a search of the text. */
export function ConversationInfo({ conversation, open, onOpenChange, onJump }: { conversation: Conversation; open: boolean; onOpenChange(open: boolean): void; onJump(messageId: string): void }) {
  const chat = useModule(chatModule);
  const { run, pending, error } = useAction(chatKey);
  const [typed, setTyped] = useState("");
  const [asked, setAsked] = useState("");
  const hits = useQuery({ queryKey: [...chatKey, "search", conversation.id, asked], queryFn: () => chat.search(conversation.id, asked), enabled: asked.length >= 2 });
  const until = conversation.mutedUntil && conversation.mutedUntil !== "infinity" ? new Date(conversation.mutedUntil).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "";

  function search(event: FormEvent) {
    event.preventDefault();
    setAsked(typed.trim());
  }

  return <DialogPanel open={open} onOpenChange={onOpenChange} size="sm" returnFocusId="conversation-info" title={t("Tùy chọn cuộc trò chuyện")} description={conversation.title}>
    <section aria-label={t("Thông báo")}>
      <h3 className="flex items-center gap-2 font-bold">{conversation.muted ? <BellOff size={17} /> : <BellRing size={17} />} {t("Thông báo")}</h3>
      {conversation.muted
        ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] p-3 text-sm">
          <p>{until ? t("Đang tắt thông báo tới {0}.", until) : t("Đang tắt thông báo của cuộc trò chuyện này.")}</p>
          <Button variant="secondary" disabled={pending} onClick={() => run(() => chat.mute(conversation.id, null))}>{t("Bật lại thông báo")}</Button>
        </div>
        : <div className="mt-2">
          <p className="text-sm text-[var(--muted)]">{t("Tắt thông báo của cuộc trò chuyện này trong:")}</p>
          <div className="mt-2 flex flex-wrap gap-2">{lengths.map(([minutes, label]) => <Button key={minutes} variant="ghost" className="bg-[var(--soft)]" disabled={pending} onClick={() => run(() => chat.mute(conversation.id, minutes))}>{label}</Button>)}</div>
        </div>}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </section>

    <section aria-label={t("Tìm trong cuộc trò chuyện")} className="mt-6">
      <h3 className="flex items-center gap-2 font-bold"><Search size={17} /> {t("Tìm trong cuộc trò chuyện")}</h3>
      <form onSubmit={search} className="mt-2 flex gap-2">
        <input type="search" aria-label={t("Từ cần tìm")} className="field min-w-0 flex-1" data-dialog-initial-focus value={typed} onChange={event => setTyped(event.target.value)} placeholder={t("Ít nhất 2 ký tự")} />
        <Button type="submit" disabled={typed.trim().length < 2}>{t("Tìm")}</Button>
      </form>
      {hits.isFetching && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{t("Đang tìm…")}</p>}
      {hits.isError && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{errorMessage(hits.error, t("Chưa tìm được. Hãy thử lại."))}</p>}
      {hits.data?.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">{t("Không có tin nhắn nào chứa “{0}”.", asked)}</p>}
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">{hits.data?.map(hit => <li key={hit.id}>
        <button type="button" onClick={() => { onOpenChange(false); onJump(hit.id); }} className="block w-full rounded-2xl bg-[var(--soft)] p-3 text-left text-sm hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]">
          <span className="flex justify-between gap-2 text-xs text-[var(--muted)]"><b className="text-[var(--ink)]">{hit.senderName}</b>{new Date(hit.createdAt).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="mt-0.5 line-clamp-2 break-words">{hit.body}</span>
        </button>
      </li>)}</ul>
    </section>
  </DialogPanel>;
}
