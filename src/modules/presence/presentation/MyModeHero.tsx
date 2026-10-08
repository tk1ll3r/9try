import { ChevronRight, X } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "../../../kernel/ui/Button";
import { remainingShare, type ActiveMode, type ActivityMode } from "../domain/ActivityMode";
import { choiceOf, durationLabel, timeLeft, type ModeChoice } from "./modes";
import { t } from "../../../kernel/i18n";

const ring = 2 * Math.PI * 34;

/**
 * The user's own mode, the first thing on the screen. With a mode on: a large icon inside a ring that
 * empties as the time runs out. Without one: a handful of activities to turn on with one tap.
 */
export function MyModeHero({ mine, now, minutes, quick, pending, onSet, onPick }: {
  mine?: ActiveMode; now: number; minutes: number; quick: ModeChoice[]; pending: boolean; onSet(mode: ActivityMode | null): void; onPick(): void;
}) {
  const choice = choiceOf(mine?.mode);
  return <section aria-label={t("Mode của bạn")} style={{ "--mode": choice?.color ?? "var(--lime-strong)" } as CSSProperties}
    className={`relative overflow-hidden rounded-[30px] border border-black/8 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-4 backdrop-blur-md transition-shadow duration-500 sm:p-5 dark:border-white/8 ${choice ? "mode-glow" : ""}`}>
    <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full bg-[var(--mode)] opacity-25 blur-3xl transition-colors duration-700" />
    {mine && choice ? <div className="relative flex items-center gap-4">
      <span key={choice.id} className="animate-pop relative grid size-20 shrink-0 place-items-center">
        {/* The ring empties as the mode's time runs out. */}
        <svg viewBox="0 0 76 76" aria-hidden className="absolute inset-0 -rotate-90">
          <circle cx="38" cy="38" r="34" fill="none" stroke="var(--soft)" strokeWidth="5" />
          <circle cx="38" cy="38" r="34" fill="none" stroke={choice.color} strokeWidth="5" strokeLinecap="round" strokeDasharray={ring}
            strokeDashoffset={ring * (1 - remainingShare(mine, now))} style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }} />
        </svg>
        <span className="grid size-14 place-items-center rounded-full text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${choice.color}, color-mix(in srgb, ${choice.color} 60%, #000))` }}><choice.Icon size={28} strokeWidth={2.1} /></span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t("Bạn đang")}</p>
        <p role="status" className="truncate text-2xl font-black tracking-tight">{choice.label}</p>
        <p className="truncate text-sm text-[var(--muted)]">{t("{0} · bạn bè đang thấy", timeLeft(mine.expiresAt, now))}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="secondary" className="min-h-9 px-3 py-1.5" disabled={pending} onClick={onPick}>{t("Đổi mode")}</Button>
          <Button variant="ghost" className="min-h-9 px-3 py-1.5" disabled={pending} aria-label={t("Tắt mode")} onClick={() => onSet(null)}><X size={16} /> {t("Tắt")}</Button>
        </div>
      </div>
    </div> : <div className="relative">
      <p role="status" className="sr-only">{t("Chưa bật mode")}</p>
      <p className="text-xl font-black tracking-tight">{t("Bạn đang làm gì?")}</p>
      <p className="text-sm text-[var(--muted)]">{t("Chạm một hoạt động để bạn bè biết. Tự tắt sau {0}.", durationLabel(minutes))}</p>
      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {quick.map(item => <button key={item.id} type="button" disabled={pending} onClick={() => onSet(item.id)}
          className="pressable inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[var(--soft)] py-1 pl-1 pr-3.5 text-sm font-semibold disabled:opacity-60">
          <span className="grid size-9 place-items-center rounded-full text-white" style={{ background: item.color }}><item.Icon size={18} strokeWidth={2.2} /></span>{item.label}
        </button>)}
        <button type="button" onClick={onPick} className="pressable inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-3.5 text-sm font-semibold text-[var(--muted)]">{t("Mọi hoạt động")} <ChevronRight size={15} /></button>
      </div>
    </div>}
  </section>;
}
