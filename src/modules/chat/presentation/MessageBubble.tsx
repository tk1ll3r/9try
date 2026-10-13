import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { isPlainPath } from "../../../kernel/module";
import { warmImages } from "../../../kernel/warmImages";
import { messageReactions, type Attachment, type ChatMessage, type MessageReaction } from "../domain/Chat";
import { MessageMenu, reactionNames, type MessageActions } from "./MessageMenu";
import { locale, t } from "../../../kernel/i18n";

const address = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]}'"])/;
/** A message's words, with the web addresses in them as links that open outside the app. */
const Words = ({ text }: { text: string }) => <>{text.split(address).map((part, index) => index % 2
  ? <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="break-all underline">{part}</a> : part)}</>;

/** The photos of a message full screen, one at a time. */
function PhotoViewer({ photos, addresses, at, onAt }: { photos: Attachment[]; addresses: Map<string, string>; at: number | null; onAt(index: number | null): void }) {
  const queued = photos.map(photo => addresses.get(photo.path) ?? "").join("\n");
  useEffect(() => {
    if (at === null) return;
    warmImages(queued.split("\n"));
  }, [at, queued]);
  const edge = "absolute top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25";
  return <Dialog.Root open={at !== null} onOpenChange={open => { if (!open) onAt(null); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/90" />
      <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 grid place-items-center p-4 outline-none"
        onKeyDown={event => { if (at === null) return; if (event.key === "ArrowRight" && at < photos.length - 1) onAt(at + 1); if (event.key === "ArrowLeft" && at > 0) onAt(at - 1); }}>
        <Dialog.Title className="sr-only">{t("Ảnh {0}/{1}", (at ?? 0) + 1, photos.length)}</Dialog.Title>
        {at !== null && <img src={addresses.get(photos[at].path)} alt={t("Ảnh {0}/{1}", at + 1, photos.length)} fetchPriority="high" decoding="async" className="max-h-full max-w-full rounded-xl object-contain" />}
        {at !== null && at > 0 && <button type="button" aria-label={t("Ảnh trước")} className={`${edge} left-3`} onClick={() => onAt(at - 1)}><ChevronLeft size={24} /></button>}
        {at !== null && at < photos.length - 1 && <button type="button" aria-label={t("Ảnh sau")} className={`${edge} right-3`} onClick={() => onAt(at + 1)}><ChevronRight size={24} /></button>}
        <Dialog.Close aria-label={t("Đóng ảnh")} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"><X size={22} /></Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

/** One photo keeps its own shape; several stand in a grid of squares. A tap opens them full screen. */
function Photos({ photos, addresses }: { photos: Attachment[]; addresses: Map<string, string> }) {
  const [at, setAt] = useState<number | null>(null);
  const single = photos.length === 1;
  const warmAlbum = () => warmImages(photos.flatMap(item => {
    const url = addresses.get(item.path);
    return url ? [url] : [];
  }));
  return <>
    <div className={`mb-1 grid gap-1 overflow-hidden rounded-xl ${single ? "" : photos.length === 2 || photos.length === 4 ? "grid-cols-2" : "grid-cols-3"}`}>
      {photos.map((photo, index) => {
        const source = addresses.get(photo.path);
        return <button key={photo.path} type="button" aria-label={t("Mở ảnh {0}/{1}", index + 1, photos.length)} onPointerDown={warmAlbum} onClick={() => setAt(index)} disabled={!source}
          className="relative block overflow-hidden rounded-lg bg-black/10" style={single ? { aspectRatio: `${photo.width} / ${photo.height}`, width: `min(15rem, ${(20 * photo.width / photo.height).toFixed(2)}rem)`, maxWidth: "100%" } : { aspectRatio: "1" }}>
          {source ? <img src={source} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" /> : <span className="skeleton absolute inset-0 !rounded-none" />}
        </button>;
      })}
    </div>
    <PhotoViewer photos={photos} addresses={addresses} at={at} onAt={setAt} />
  </>;
}

interface Props {
  message: ChatMessage;
  mine: boolean;
  /** In a group or a room: say who wrote, above the first message of a run. */
  showName: boolean;
  first: boolean;
  last: boolean;
  addresses: Map<string, string>;
  /** Lit for a moment after the thread jumped to this message. */
  lit: boolean;
  /** What can be done with this message; without it the message is only read (a closed room, a message still being sent). */
  actions?: MessageActions;
  onJump(messageId: string): void;
  /** The line under the message, such as who has read this far. */
  below?: ReactNode;
}

/**
 * One message: what it answers, its photos, its card, its words, its reactions, and the menu of what
 * can be done with it. On a touch screen a long press opens that menu and a swipe to the right starts an answer.
 */
export function MessageBubble({ message, mine, showName, first, last, addresses, lit, actions, onJump, below }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const touch = useRef<{ x: number; y: number; timer: number; swiping: boolean } | null>(null);
  const [pulled, setPulled] = useState(0);

  const down = (event: PointerEvent) => {
    if (!actions || event.pointerType === "mouse") return;
    const timer = window.setTimeout(() => { menu.current?.setAttribute("open", ""); touch.current = null; }, 480);
    touch.current = { x: event.clientX, y: event.clientY, timer, swiping: false };
  };
  const move = (event: PointerEvent) => {
    const start = touch.current;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) window.clearTimeout(start.timer);
    if (!start.swiping && dx > 14 && Math.abs(dx) > Math.abs(dy) * 1.5) start.swiping = true;
    if (start.swiping) setPulled(Math.max(0, Math.min(72, dx)));
  };
  const up = () => {
    const start = touch.current;
    if (start) window.clearTimeout(start.timer);
    if (start?.swiping && pulled > 52) actions?.reply();
    touch.current = null;
    setPulled(0);
  };

  const counts = messageReactions.filter(([key]) => message.reactions[key]);
  const card = message.card && isPlainPath(message.card.path) ? message.card : null;
  const corner = mine ? `${first ? "rounded-tr-2xl" : "rounded-tr-md"} ${last ? "rounded-br-2xl" : "rounded-br-md"} rounded-l-2xl` : `${first ? "rounded-tl-2xl" : "rounded-tl-md"} ${last ? "rounded-bl-2xl" : "rounded-bl-md"} rounded-r-2xl`;

  return <div id={`msg-${message.id}`} className={`${first ? "mt-3" : "mt-0.5"} flex flex-col ${mine ? "items-end" : "items-start"}`}>
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={pulled ? { transform: `translateX(${pulled}px)` } : undefined}
      className={`group relative flex w-full touch-pan-y items-end gap-1 ${mine ? "flex-row-reverse" : ""} ${pulled ? "" : "transition-transform duration-200"}`}>
      <div className={`min-w-0 max-w-[min(80%,34rem)] px-3 py-2 text-sm leading-6 transition-shadow duration-500 ${corner} ${mine ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)]"} ${message.pending ? "opacity-60" : ""} ${lit ? "shadow-[0_0_0_3px_var(--lime-strong)]" : ""}`}>
        {showName && first && !mine && <p className="text-xs font-bold">{message.senderName}</p>}
        {message.replyTo && <button type="button" onClick={() => onJump(message.replyTo!.id)} className={`mb-1 block w-full rounded-lg border-l-4 border-[var(--lime-strong)] px-2 py-1 text-left text-xs leading-5 ${mine ? "bg-white/10" : "bg-black/5 dark:bg-white/5"}`}>
          <b className="block">{message.replyTo.senderName}</b>
          <span className="line-clamp-2 break-words opacity-80">{message.replyTo.deleted ? t("Tin nhắn đã thu hồi") : message.replyTo.body}</span>
        </button>}
        {message.deleted ? <p className="italic opacity-70">{t("Tin nhắn đã thu hồi")}</p> : <>
          {message.photos.length > 0 && <Photos photos={message.photos} addresses={addresses} />}
          {message.uploading ? <p className="italic opacity-80">{t("Đang gửi {0} ảnh…", message.uploading)}</p> : null}
          {card && <Link to={card.path} className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2 font-semibold ${mine ? "bg-white/10" : "bg-[var(--surface)]"}`}>
            <span className="min-w-0 flex-1 break-words">{card.title || t("Mở trong ứng dụng")}</span><ArrowUpRight size={16} className="shrink-0" />
          </Link>}
          {message.body && <p className="whitespace-pre-wrap break-words"><Words text={message.body} /></p>}
        </>}
        {last && <p className="text-right text-[10px] opacity-70">{message.pending ? t("Đang gửi…") : <>
          {message.edited && <>{t("đã sửa")} · </>}{new Date(message.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
        </>}</p>}
      </div>
      {actions && <MessageMenu mine={mine} myReaction={message.myReaction} actions={actions} handle={menu} />}
    </div>
    {counts.length > 0 && <div className="-mt-1.5 flex gap-1 px-2">
      {counts.map(([key, sign]) => <button key={key} type="button" disabled={!actions} aria-pressed={message.myReaction === key} aria-label={t("{0}: {1}", reactionNames[key], message.reactions[key])}
        onClick={() => actions?.react(message.myReaction === key ? null : key as MessageReaction)}
        className={`inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold shadow-sm ${message.myReaction === key ? "border-[var(--lime-strong)] bg-[var(--lime)] text-[var(--ink)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
        <span aria-hidden>{sign}</span>{message.reactions[key]}
      </button>)}
    </div>}
    {below}
  </div>;
}
