import { Camera } from "lucide-react";
import type { CSSProperties } from "react";
import { Avatar } from "../../../kernel/ui/Avatar";
import type { ModeChoice } from "./modes";

/**
 * A person's picture or initial in a circle. While they have a mode, a ring in the mode's color turns
 * around it and the mode's icon sits on the corner; without one the circle is plain and muted.
 */
export function MemberAvatar({ name, src, choice, size = "md", online, photo }: { name: string; src?: string | null; choice?: ModeChoice; size?: "sm" | "md"; online?: "active" | "recent" | "idle"; photo?: "new" | "seen" }) {
  const box = size === "sm" ? "size-11 text-base border-[3px]" : "size-14 text-xl border-4";
  const badge = size === "sm" ? "size-5 -bottom-1 -right-1" : "size-7 -bottom-1 -right-1";
  return <span className={choice ? "mode-ring" : "relative grid place-items-center rounded-full"} style={choice ? { "--mode": choice.color } as CSSProperties : undefined}>
    <Avatar name={name} src={src} className={`${box} border-[var(--surface)] font-black ${choice ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`} />
    {/* A dot at the top while the person's app is open: full when it is open now, hollow when it was a moment ago. */}
    {(online === "active" || online === "recent") && <span aria-hidden className={`absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-[var(--surface)] ${online === "active" ? "bg-emerald-500" : "bg-[var(--surface)] ring-2 ring-inset ring-emerald-500"}`} />}
    {/* A camera at the top left while the person has a photo of the day: bright while there is one not looked at yet. */}
    {photo && <span aria-hidden className={`absolute -left-1 -top-1 grid size-5 place-items-center rounded-full border-2 border-[var(--surface)] ${photo === "new" ? "bg-[var(--lime)] text-[var(--ink)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}><Camera size={10} strokeWidth={2.6} /></span>}
    {choice && <span className={`animate-pop absolute ${badge} grid place-items-center rounded-full border-2 border-[var(--surface)] text-white`} style={{ background: choice.color }}>
      <choice.Icon size={size === "sm" ? 11 : 14} strokeWidth={2.4} />
    </span>}
  </span>;
}
