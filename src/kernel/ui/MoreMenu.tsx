import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** A list of choices inside a `Popover`: each child is one row. */
export const menuRows = "grid gap-0.5 text-sm *:flex *:min-h-11 *:w-full *:items-center *:justify-start *:gap-2.5 *:rounded-xl *:px-3 *:text-left *:font-semibold *:hover:bg-[var(--soft)]";

/**
 * A button that opens a small panel under its right edge. The panel closes after a click inside it,
 * on a click elsewhere and on Escape. A part that should keep it open stops the click from reaching the panel.
 */
export function Popover({ label, trigger, triggerClassName, panelClassName = "", children }: {
  label: string; trigger: ReactNode; triggerClassName: string; panelClassName?: string; children: ReactNode;
}) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) box.current?.removeAttribute("open");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details ref={box} className="relative">
    <summary aria-label={label} className={`pressable cursor-pointer list-none [&::-webkit-details-marker]:hidden ${triggerClassName}`}>{trigger}</summary>
    <div onClick={() => box.current?.removeAttribute("open")} className={`animate-pop absolute right-0 z-30 mt-1 min-w-56 origin-top-right rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-2xl ${panelClassName}`}>
      {children}
    </div>
  </details>;
}

/** A "…" button that opens the actions people need less often, so a row can show one main action. */
export function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  return <Popover label={label} trigger={<MoreHorizontal size={19} />} panelClassName={menuRows}
    triggerClassName="grid size-11 place-items-center rounded-2xl text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]">{children}</Popover>;
}
