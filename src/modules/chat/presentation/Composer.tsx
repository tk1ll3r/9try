import { CornerUpLeft, ImagePlus, Pencil, Send, SquareArrowOutUpRight, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toJpeg } from "../../../kernel/image";
import { isPlainPath } from "../../../kernel/module";
import { Button } from "../../../kernel/ui/Button";
import { chatPhotoLimits, maxPhotos, type ChatMessage, type MessageCard } from "../domain/Chat";
import { t } from "../../../kernel/i18n";

export interface PreparedPhoto { blob: Blob; width: number; height: number; preview: string }
export interface Outgoing { body: string; photos: PreparedPhoto[]; card: MessageCard | null }

const draftKey = (conversationId: string) => `gnouht-chat-draft:${conversationId}`;
function storedDraft(conversationId: string): string {
  try { return localStorage.getItem(draftKey(conversationId)) ?? ""; } catch { return ""; }
}
function storeDraft(conversationId: string, text: string) {
  try { if (text) localStorage.setItem(draftKey(conversationId), text); else localStorage.removeItem(draftKey(conversationId)); } catch { /* The draft then lasts for this visit only. */ }
}

/**
 * The box a message is written in. It keeps what was typed for each conversation on the device,
 * shows what is being answered or changed, takes up to six photos, and can start with a first line
 * or a card that another screen handed over in the address (`?draft=…`, `?ref=/path&title=…`).
 */
export function Composer({ conversationId, replying, onCancelReply, editing, onCancelEdit, onSend, onEdit, onTyping, busy, restore }: {
  conversationId: string;
  replying: ChatMessage | null; onCancelReply(): void;
  editing: ChatMessage | null; onCancelEdit(): void;
  onSend(message: Outgoing): void;
  onEdit(messageId: string, body: string): void;
  /** Called while the person writes, for the line that tells the others. */
  onTyping(): void;
  busy: boolean;
  /** A message that could not be sent: its words, its photos and its card come back into the box, where nothing took their place meanwhile. */
  restore: (Outgoing & { token: number }) | null;
}) {
  const [params, setParams] = useSearchParams();
  const [text, setText] = useState(() => params.get("draft")?.slice(0, 4000) ?? storedDraft(conversationId));
  const [card, setCard] = useState<MessageCard | null>(() => {
    const path = params.get("ref");
    return path && isPlainPath(path) ? { path, title: (params.get("title") ?? "").slice(0, 120) } : null;
  });
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [problem, setProblem] = useState("");
  const box = useRef<HTMLTextAreaElement>(null);
  const aside = useRef("");
  const told = useRef(0);

  // What another screen handed over leaves the address once it is in the box.
  useEffect(() => {
    if (["draft", "ref", "title"].some(name => params.has(name))) setParams(current => { for (const name of ["draft", "ref", "title"]) current.delete(name); return current; }, { replace: true });
  }, []);
  // Changing a message borrows the box; what was being written waits and comes back.
  useEffect(() => {
    if (editing) { aside.current = text; setText(editing.body); box.current?.focus(); }
    else if (aside.current) { setText(aside.current); aside.current = ""; }
  }, [editing?.id]);
  useEffect(() => { if (replying) box.current?.focus(); }, [replying?.id]);
  useEffect(() => {
    if (!restore) return;
    setText(current => current || restore.body);
    setPhotos(current => current.length ? current : restore.photos);
    setCard(current => current ?? restore.card);
  }, [restore?.token]);

  function write(value: string) {
    setText(value);
    if (editing) return;
    storeDraft(conversationId, value);
    // The others are told at most every three seconds.
    if (value.trim() && Date.now() - told.current > 3000) { told.current = Date.now(); onTyping(); }
  }

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = [...event.currentTarget.files ?? []].slice(0, maxPhotos - photos.length);
    event.currentTarget.value = "";
    if (!files.length) return;
    setProblem(""); setPreparing(true);
    try {
      const made: PreparedPhoto[] = [];
      for (const file of files) { const photo = await toJpeg(file, chatPhotoLimits); made.push({ ...photo, preview: URL.createObjectURL(photo.blob) }); }
      setPhotos(current => [...current, ...made].slice(0, maxPhotos));
    } catch (cause) { setProblem(cause instanceof Error && cause.message ? cause.message : t("Không đọc được ảnh này. Hãy chọn ảnh khác.")); }
    finally { setPreparing(false); }
  }
  function drop(photo: PreparedPhoto) {
    URL.revokeObjectURL(photo.preview);
    setPhotos(current => current.filter(item => item !== photo));
  }

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (busy || preparing) return;
    if (editing) {
      if (body && body !== editing.body) onEdit(editing.id, body); else onCancelEdit();
      return;
    }
    if (!body && !photos.length && !card) return;
    onSend({ body, photos, card });
    setText(""); setPhotos([]); setCard(null); setProblem("");
    storeDraft(conversationId, "");
  }
  // Enter sends with a keyboard; on a touch screen it starts a new line. Escape lets go of what is being answered or changed.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); submit(); }
    if (event.key === "Escape" && (editing || replying)) { event.preventDefault(); if (editing) onCancelEdit(); else onCancelReply(); }
  }

  const bar = "mb-2 flex items-center gap-2 rounded-2xl bg-[var(--soft)] py-1.5 pl-3 pr-1 text-sm";
  const close = "grid size-9 shrink-0 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)]";
  return <form onSubmit={submit}>
    {editing && <div className={bar}><Pencil size={15} className="shrink-0 text-[var(--muted)]" /><span className="min-w-0 flex-1 truncate font-semibold">{t("Đang sửa tin nhắn")}</span>
      <button type="button" aria-label={t("Thôi sửa")} className={close} onClick={onCancelEdit}><X size={16} /></button></div>}
    {!editing && replying && <div className={bar}><CornerUpLeft size={15} className="shrink-0 text-[var(--muted)]" />
      <span className="min-w-0 flex-1"><b className="block truncate text-xs">{t("Trả lời {0}", replying.senderName || t("chính bạn"))}</b><span className="block truncate text-xs text-[var(--muted)]">{replying.body || (replying.photos.length ? t("Ảnh") : replying.card?.title ?? "")}</span></span>
      <button type="button" aria-label={t("Thôi trả lời")} className={close} onClick={onCancelReply}><X size={16} /></button></div>}
    {!editing && card && <div className={bar}><SquareArrowOutUpRight size={15} className="shrink-0 text-[var(--muted)]" />
      <span className="min-w-0 flex-1 truncate font-semibold">{card.title || t("Một mục trong ứng dụng")}</span>
      <button type="button" aria-label={t("Bỏ mục đính kèm")} className={close} onClick={() => setCard(null)}><X size={16} /></button></div>}
    {!editing && photos.length > 0 && <ul aria-label={t("Ảnh sắp gửi")} className="mb-2 flex gap-2 overflow-x-auto pb-1">
      {photos.map((photo, index) => <li key={photo.preview} className="relative shrink-0">
        <img src={photo.preview} alt={t("Ảnh {0}/{1}", index + 1, photos.length)} className="size-16 rounded-xl object-cover" />
        <button type="button" aria-label={t("Bỏ ảnh {0}", index + 1)} onClick={() => drop(photo)} className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)] shadow"><X size={13} /></button>
      </li>)}
    </ul>}
    {preparing && <p role="status" className="mb-2 text-xs text-[var(--muted)]">{t("Đang chuẩn bị ảnh…")}</p>}
    {problem && <p role="alert" className="mb-2 text-sm text-[var(--danger)]">{problem}</p>}
    <div className="flex items-end gap-2">
      {!editing && <label className={`pressable grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl bg-[var(--soft)] focus-within:ring-2 focus-within:ring-[var(--focus)] ${photos.length >= maxPhotos ? "pointer-events-none opacity-40" : ""}`}>
        <ImagePlus size={19} /><span className="sr-only">{t("Thêm ảnh")}</span>
        <input type="file" accept="image/*" multiple className="sr-only" disabled={preparing || photos.length >= maxPhotos} onChange={event => void pick(event)} />
      </label>}
      <label className="sr-only" htmlFor="chat-message">{t("Tin nhắn")}</label>
      <textarea id="chat-message" ref={box} className="field max-h-32 min-w-0 flex-1 resize-none" rows={1} maxLength={4000} value={text} onChange={event => write(event.target.value)} onKeyDown={onKeyDown} placeholder={t("Viết tin nhắn…")} />
      <Button type="submit" disabled={busy || preparing || (editing ? !text.trim() : !text.trim() && !photos.length && !card)} aria-label={editing ? t("Lưu thay đổi") : t("Gửi tin nhắn")}><Send size={17} /></Button>
    </div>
  </form>;
}
