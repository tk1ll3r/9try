import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { t } from "../../../kernel/i18n";

/** How much of the map the sheet covers: its handle only, about half, or all but the map's buttons. */
export type SheetHeight = "peek" | "half" | "full";

const order: SheetHeight[] = ["peek", "half", "full"];
const sizes: Record<SheetHeight, string> = { peek: "h-[5.5rem]", half: "h-[55%]", full: "h-[calc(100%-4.5rem)]" };
/** The handle's height in pixels, and what stays of the map above a sheet that is all the way up. */
const peek = 88, above = 72;

/**
 * Below the wide layout: a sheet over the foot of the map, with three heights. It is dragged by its
 * head, and the bar at its top steps through the heights for a keyboard or a screen reader. On a
 * wide screen it is nothing but its content, in the column beside the map.
 */
export function MapSheet({ height, onHeight, head, children }: { height: SheetHeight; onHeight(next: SheetHeight): void; head: ReactNode; children: ReactNode }) {
  const sheet = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  // The height in pixels while a finger holds the sheet.
  const [pulled, setPulled] = useState<number | null>(null);
  const says: Record<SheetHeight, string> = {
    peek: t("Bảng đang thu gọn. Bấm để mở danh sách."),
    half: t("Bảng đang mở danh sách. Bấm để mở hết."),
    full: t("Bảng đang mở hết. Bấm để thu gọn."),
  };
  const room = () => sheet.current?.parentElement?.clientHeight ?? 0;
  const within = (pixels: number) => Math.min(room() - above, Math.max(peek, pixels));

  function down(event: PointerEvent) {
    if (event.button || !sheet.current) return;
    const hold = { y: event.clientY, from: sheet.current.getBoundingClientRect().height, moved: false };
    // The window hears the rest of it: a mouse leaves the head of the sheet as soon as it pulls it.
    const move = (at: globalThis.PointerEvent) => {
      const up = hold.y - at.clientY;
      // A press that barely moves is a press: on the bar, or on a face in the head.
      if (!hold.moved && Math.abs(up) < 6) return;
      hold.moved = true;
      setPulled(within(hold.from + up));
    };
    const release = (at: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      if (!hold.moved) return;
      // The click that ends a drag is not a press on what lies under the finger.
      dragged.current = true;
      window.setTimeout(() => { dragged.current = false; }, 0);
      const now = within(hold.from + hold.y - at.clientY);
      const stops: [SheetHeight, number][] = [["peek", peek], ["half", room() * .55], ["full", room() - above]];
      onHeight(stops.reduce((best, stop) => Math.abs(stop[1] - now) < Math.abs(best[1] - now) ? stop : best)[0]);
      setPulled(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  // Above the map: its credits are an open <details>, and the stylesheet lifts whatever holds one to 20.
  return <div ref={sheet} data-testid="map-sheet" data-height={height} style={pulled === null ? undefined : { height: pulled }}
    className={`absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-[var(--border)] bg-[var(--paper)] shadow-[0_-16px_40px_-20px_rgb(0_0_0/.5)] ${pulled === null ? "transition-[height] duration-300 ease-[var(--ease-out)]" : ""} ${sizes[height]} xl:static xl:z-auto xl:block xl:h-auto xl:overflow-visible xl:rounded-none xl:border-0 xl:bg-transparent xl:shadow-none`}>
    <div className="shrink-0 touch-none select-none xl:hidden" onPointerDown={down}
      onClickCapture={event => { if (dragged.current) { event.stopPropagation(); event.preventDefault(); } }}>
      <button type="button" aria-label={says[height]} aria-expanded={height !== "peek"} aria-controls="location-panel" onClick={() => onHeight(order[(order.indexOf(height) + 1) % order.length])}
        className="grid h-11 w-full place-items-center rounded-t-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]">
        <i aria-hidden className="h-1.5 w-11 rounded-full bg-[var(--border)]" />
      </button>
      {head}
    </div>
    {/* Folded away, the list and the form are not there to be reached by a keyboard either. */}
    <div id="location-panel" className={`min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-4 xl:block xl:overflow-visible xl:p-0 ${height === "peek" && pulled === null ? "hidden" : ""}`}>{children}</div>
  </div>;
}
