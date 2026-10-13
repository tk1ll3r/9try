import { Copy, CornerUpLeft, MoreHorizontal, Pencil, Undo2 } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { menuRows } from "../../../kernel/ui/MoreMenu";
import { messageReactions, type MessageReaction } from "../domain/Chat";
import { t } from "../../../kernel/i18n";

export const reactionNames: Record<MessageReaction, string> = { heart: t("Tim"), laugh: t("Cười"), wow: t("Ngạc nhiên"), sad: t("Buồn"), angry: t("Giận"), like: t("Thích") };

/** What can be done with one message. A step that is not offered for it is left out. */
export interface MessageActions {
  react(reaction: MessageReaction | null): void;
  reply(): void;
  copy?(): void;
  edit?(): void;
  unsend?(): void;
}

/**
 * The "…" beside a message: a reaction, an answer, a copy, and for one's own message a change or
 * taking it back. It shows under the pointer and for the keyboard; on a touch screen a long press on
 * the message opens it through `handle`. The panel is placed against the row of the message, which
 * has to be `relative`: at the side the message is on, and above it when the message is low in the thread.
 */
export function MessageMenu({ mine, myReaction, actions, handle }: { mine: boolean; myReaction: MessageReaction | null; actions: MessageActions; handle: RefObject<HTMLDetailsElement | null> }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !handle.current?.contains(event.target as Node)) handle.current?.removeAttribute("open");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  function place(box: HTMLDetailsElement) {
    if (!box.open) return;
    const around = (box.closest("[data-thread]") ?? document.body).getBoundingClientRect();
    setUp(box.getBoundingClientRect().top - around.top > 270);
  }
  return <details ref={handle} className="shrink-0 self-center" onToggle={event => place(event.currentTarget)}>
    <summary aria-label={t("Thao tác với tin nhắn")} className="grid size-9 cursor-pointer list-none place-items-center rounded-full text-[var(--muted)] opacity-0 transition-opacity hover:bg-[var(--soft)] focus-visible:opacity-100 group-hover:opacity-100 [&::-webkit-details-marker]:hidden [details[open]>&]:opacity-100"><MoreHorizontal size={17} /></summary>
    <div onClick={() => handle.current?.removeAttribute("open")}
      className={`animate-pop absolute z-30 w-60 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 text-[var(--ink)] shadow-2xl ${up ? "bottom-full mb-1" : "top-full mt-1"} ${mine ? "right-0" : "left-0"}`}>
      <div role="group" aria-label={t("Thả cảm xúc")} className="flex justify-between px-0.5 pb-1">
        {messageReactions.map(([key, sign]) => <button key={key} type="button" aria-label={reactionNames[key]} aria-pressed={myReaction === key} onClick={() => actions.react(myReaction === key ? null : key)}
          className={`grid size-9 place-items-center rounded-full text-lg transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-125 ${myReaction === key ? "bg-[var(--soft)]" : ""}`}>{sign}</button>)}
      </div>
      <div className={menuRows}>
        <button type="button" onClick={actions.reply}><CornerUpLeft size={16} /> {t("Trả lời")}</button>
        {actions.copy && <button type="button" onClick={actions.copy}><Copy size={16} /> {t("Sao chép")}</button>}
        {actions.edit && <button type="button" onClick={actions.edit}><Pencil size={16} /> {t("Sửa")}</button>}
        {actions.unsend && <button type="button" className="text-[var(--danger)]" onClick={actions.unsend}><Undo2 size={16} /> {t("Thu hồi tin nhắn")}</button>}
      </div>
    </div>
  </details>;
}
