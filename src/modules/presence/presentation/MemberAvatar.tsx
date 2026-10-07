import type { CSSProperties } from "react";
import type { ModeChoice } from "./modes";

/**
 * A person's initial in a circle. While they have a mode, a ring in the mode's color turns around it
 * and the mode's icon sits on the corner; without one the circle is plain and muted.
 */
export function MemberAvatar({ name, choice, size = "md" }: { name: string; choice?: ModeChoice; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-24 text-4xl" : "size-14 text-xl";
  const badge = size === "lg" ? "size-10 -bottom-1 -right-1" : "size-7 -bottom-1 -right-1";
  return <span className={choice ? "mode-ring" : "relative grid place-items-center rounded-full"} style={choice ? { "--mode": choice.color } as CSSProperties : undefined}>
    <span className={`grid ${box} place-items-center rounded-full border-4 border-[var(--surface)] font-black ${choice ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
    {choice && <span className={`animate-pop absolute ${badge} grid place-items-center rounded-full border-2 border-[var(--surface)] text-white`} style={{ background: choice.color }}>
      <choice.Icon size={size === "lg" ? 20 : 14} strokeWidth={2.4} />
    </span>}
  </span>;
}
