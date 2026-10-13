import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { chatModule } from "../chat.module";
import type { RoomSource } from "../domain/Chat";
import { chatKey } from "./useChat";
import { t } from "../../../kernel/i18n";

/**
 * The way into the temporary discussion of an event, a meetup or a mode, for a screen that shows
 * that thing. Someone who may join sees "Tham gia thảo luận"; someone who is in it, "Vào thảo luận".
 * With `canOpen`, the owner of the thing can turn the discussion on, with a first message if they
 * like. Where there is nothing to offer it renders nothing.
 */
export function DiscussionButton({ source, canOpen }: { source: RoomSource; canOpen: boolean }) {
  const chat = useModule(chatModule);
  const navigate = useNavigate();
  // A server without rooms has none: the button then stays away.
  const found = useQuery({ queryKey: [...chatKey, "room", source.kind, source.id, source.occurrence ?? ""], queryFn: async () => (await chat.rooms({ source }).catch(() => null))?.[0] ?? null });
  const { run, pending, error } = useAction(chatKey);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState("");
  const room = found.data;
  const look = "pressable inline-flex min-h-9 items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-1.5 text-sm font-semibold";

  function open(event: FormEvent) {
    event.preventDefault();
    run(() => chat.openRoom(source, message), id => navigate(`/chat/${id}`));
  }

  if (room?.joined) return <Link to={`/chat/${room.id}`} className={look}><MessagesSquare size={16} /> {t("Vào thảo luận · {0}", room.memberCount)}</Link>;
  if (room && !room.closed && !room.removed) return <>
    <button type="button" disabled={pending} onClick={() => run(() => chat.joinRoom(room.id), () => navigate(`/chat/${room.id}`))} className={look}><MessagesSquare size={16} /> {t("Tham gia thảo luận · {0}", room.memberCount)}</button>
    {error && <p role="alert" className="w-full text-sm text-[var(--danger)]">{error}</p>}
  </>;
  if (room || !canOpen || found.isPending) return null;
  if (!asking) return <button type="button" onClick={() => setAsking(true)} className={look}><MessagesSquare size={16} /> {t("Mở thảo luận")}</button>;
  return <form onSubmit={open} className="grid w-full gap-2 rounded-2xl bg-[var(--soft)] p-3" aria-busy={pending}>
    <label className="grid gap-1 text-sm font-semibold">{t("Lời mở đầu (tùy chọn)")}
      <input className="field" autoFocus maxLength={4000} value={message} onChange={event => setMessage(event.target.value)} placeholder={t("Ví dụ: mấy giờ mọi người tới?")} />
    </label>
    <p className="text-xs leading-5 text-[var(--muted)]">{t("Những người xem được mục này tham gia được. Phòng tự đóng khi việc kết thúc, và tin nhắn bị xóa 7 ngày sau đó.")}</p>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? t("Đang mở…") : t("Mở phòng")}</Button><Button variant="ghost" onClick={() => setAsking(false)}>{t("Thôi")}</Button></div>
  </form>;
}
