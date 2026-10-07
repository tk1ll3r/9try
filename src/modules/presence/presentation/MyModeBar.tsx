import { Clock3, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "../../../kernel/ui/Button";
import { activityModes, remainingShare, type ActiveMode, type ActivityMode } from "../domain/ActivityMode";
import { choiceOf, choices, timeLeft } from "./modes";

const ring = 2 * Math.PI * 21;

/**
 * The user's own mode in one line, so that friends fit on the first screen.
 * Without a mode: six round buttons, one tap turns a mode on. With one: what it is, the time left, change and stop.
 */
export function MyModeBar({ mine, now, pending, onSet, onPick }: { mine?: ActiveMode; now: number; pending: boolean; onSet(mode: ActivityMode | null): void; onPick(): void }) {
  const choice = choiceOf(mine?.mode);
  return <section aria-label="Mode của bạn" style={choice ? { "--mode": choice.color } as CSSProperties : undefined}
    className={`flex items-center gap-3 rounded-[26px] border border-black/8 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-3 backdrop-blur-md transition-shadow duration-500 dark:border-white/8 ${choice ? "mode-glow" : ""}`}>
    {mine && choice ? <>
      <span key={choice.id} className="animate-pop relative grid size-12 shrink-0 place-items-center">
        {/* The ring empties as the mode's time runs out. */}
        <svg viewBox="0 0 48 48" aria-hidden className="absolute inset-0 -rotate-90">
          <circle cx="24" cy="24" r="21" fill="none" stroke="var(--soft)" strokeWidth="3.5" />
          <circle cx="24" cy="24" r="21" fill="none" stroke={choice.color} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={ring}
            strokeDashoffset={ring * (1 - remainingShare(mine, now))} style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }} />
        </svg>
        <span className="grid size-8 place-items-center rounded-full text-white" style={{ background: choice.color }}><choice.Icon size={17} strokeWidth={2.3} /></span>
      </span>
      <div className="min-w-0 flex-1">
        <p role="status" className="truncate font-black">{choice.label}</p>
        <p className="truncate text-xs text-[var(--muted)]">{timeLeft(mine.expiresAt, now)} · bạn bè đang thấy</p>
      </div>
      <Button variant="ghost" className="px-3" disabled={pending} onClick={onPick}>Đổi</Button>
      <Button variant="ghost" className="px-3" disabled={pending} aria-label="Tắt mode" onClick={() => onSet(null)}><X size={16} /> Tắt</Button>
    </> : <>
      <p role="status" className="sr-only">Chưa bật mode</p>
      <p className="hidden shrink-0 text-sm font-semibold sm:block">Bạn đang làm gì?</p>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-1">
        {choices.filter(item => activityModes.includes(item.id)).map(item => <button key={item.id} type="button" disabled={pending} aria-label={item.label} title={item.label}
          onClick={() => onSet(item.id)} className="pressable grid size-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-60" style={{ background: item.color }}>
          <item.Icon size={20} strokeWidth={2.2} />
        </button>)}
      </div>
      <Button variant="ghost" className="px-3" aria-label="Chọn thời hạn" onClick={onPick}><Clock3 size={18} /></Button>
    </>}
  </section>;
}
