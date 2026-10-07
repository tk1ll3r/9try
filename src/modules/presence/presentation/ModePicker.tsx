import type { CSSProperties } from "react";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { activityModes, type ActiveMode, type ActivityMode } from "../domain/ActivityMode";
import { choices, durations } from "./modes";

/** The full choice: six modes and how long the mode should last. Choosing a mode closes the dialog. */
export function ModePicker({ open, onOpenChange, mine, minutes, onMinutes, pending, onSet }: {
  open: boolean; onOpenChange(open: boolean): void; mine?: ActiveMode; minutes: number; onMinutes(minutes: number): void; pending: boolean; onSet(mode: ActivityMode): void;
}) {
  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title="Mode của bạn" description="Chỉ bạn bè đã kết nối thấy mode. Nó tự tắt khi hết giờ, và không dựa vào GPS.">
    <div role="group" aria-label="Tự tắt sau" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-[var(--muted)]">Tự tắt sau</span>
      {durations.map(([value, label]) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => onMinutes(value)}
        className={`min-h-9 rounded-full px-3 font-semibold transition-colors duration-200 ${minutes === value ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>{label}</button>)}
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
      {choices.filter(choice => activityModes.includes(choice.id)).map(choice => {
        const on = mine?.mode === choice.id;
        return <button key={choice.id} type="button" disabled={pending} aria-pressed={on} style={{ "--mode": choice.color } as CSSProperties} onClick={() => onSet(choice.id)}
          className={`pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl border-2 p-2 text-sm font-bold disabled:opacity-60 ${on ? "mode-glow border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_14%,var(--surface))]" : "border-transparent bg-[var(--soft)]"}`}>
          <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: choice.color }}><choice.Icon size={22} strokeWidth={2.2} /></span>
          {choice.label}
        </button>;
      })}
    </div>
  </DialogPanel>;
}
