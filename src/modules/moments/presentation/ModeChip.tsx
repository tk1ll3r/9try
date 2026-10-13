import { choiceOf } from "../../presence";
import type { CustomModeIcon } from "../../presence";

/** The activity a photo was taken during, in that activity's color. Nothing for a photo without one. */
export function ModeChip({ mode, label, icon, color, className = "" }: { mode: string | null; label?: string | null; icon?: CustomModeIcon | null; color?: string | null; className?: string }) {
  const choice = choiceOf(mode ?? undefined, label && icon && color ? { label, icon, color } : null);
  if (!choice) return null;
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${className}`} style={{ background: choice.color }}><choice.Icon size={11} /> {choice.label}</span>;
}
