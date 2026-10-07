import { MoreHorizontal } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * A "…" button that opens the actions people need less often, so a row can show one main action.
 * It closes after a choice, on a click elsewhere and on Escape.
 */
export function MoreMenu({ label, children }: { label: string; children: ReactNode }) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menu.current?.contains(event.target as Node)) menu.current?.removeAttribute("open");
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", close); };
  }, []);
  return <details ref={menu} className="relative">
    <summary aria-label={label} className="pressable grid size-11 cursor-pointer list-none place-items-center rounded-2xl text-[var(--muted)] hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)] [&::-webkit-details-marker]:hidden"><MoreHorizontal size={19} /></summary>
    <div onClick={() => menu.current?.removeAttribute("open")} className="animate-pop absolute right-0 z-30 mt-1 grid min-w-56 origin-top-right gap-0.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1.5 text-sm shadow-2xl *:flex *:min-h-11 *:w-full *:items-center *:justify-start *:gap-2 *:rounded-xl *:px-3 *:text-left *:font-semibold hover:*:bg-[var(--soft)]">
      {children}
    </div>
  </details>;
}
