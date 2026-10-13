import { useState, type CSSProperties } from "react";
import { Plus } from "lucide-react";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import type { ActiveMode, ActivityMode, CustomActivityMode } from "../domain/ActivityMode";
import { activityGroups, choiceOf, durations } from "./modes";
import { CustomModeDialog } from "./CustomModeDialog";
import { t } from "../../../kernel/i18n";

/** Every activity, in groups, and how long the mode should last. Choosing an activity closes the dialog. */
export function ModePicker({ open, onOpenChange, mine, minutes, customModes, onMinutes, pending, onSet, onCreate }: {
  open: boolean; onOpenChange(open: boolean): void; mine?: ActiveMode; minutes: number; customModes: CustomActivityMode[]; onMinutes(minutes: number): void; pending: boolean; onSet(mode: ActivityMode): void; onCreate(mode: CustomActivityMode): void;
}) {
  const [creating, setCreating] = useState(false);
  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title={t("Mode của bạn")} description={t("Chỉ bạn bè đã kết nối thấy mode. Nó tự tắt khi hết giờ, và không dựa vào GPS.")}>
    <div role="group" aria-label={t("Tự tắt sau")} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-semibold text-[var(--muted)]">{t("Tự tắt sau")}</span>
      {durations.map(([value, label]) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => onMinutes(value)}
        className={`min-h-9 rounded-full px-3 font-semibold transition-colors duration-200 ${minutes === value ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>{label}</button>)}
    </div>
    {activityGroups.map(group => <section key={group.title} className="mt-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.title}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {group.items.map(choice => {
          const on = mine?.mode === choice.id;
          return <button key={choice.id} type="button" disabled={pending} aria-pressed={on} style={{ "--mode": choice.color } as CSSProperties} onClick={() => onSet(choice.id)}
            className={`pressable flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-3xl border-2 p-2 text-center text-xs font-bold disabled:opacity-60 ${on ? "mode-glow border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_14%,var(--surface))]" : "border-transparent bg-[var(--soft)]"}`}>
            <span className="grid size-10 place-items-center rounded-2xl text-white" style={{ background: choice.color }}><choice.Icon size={20} strokeWidth={2.2} /></span>
            {choice.label}
          </button>;
        })}
      </div>
    </section>)}
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t("Mode riêng của bạn")}</h3>
        <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--soft)]"><Plus size={16}/>{t("Tạo mode")}</button>
      </div>
      {customModes.length ? <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {customModes.map(mode => { const choice = choiceOf(mode.mode, mode)!; const on = mine?.mode === mode.mode;
          return <button key={mode.mode} type="button" disabled={pending} aria-pressed={on} style={{ "--mode": choice.color } as CSSProperties} onClick={() => onSet(mode.mode)}
            className={`pressable flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-3xl border-2 p-2 text-center text-xs font-bold disabled:opacity-60 ${on ? "mode-glow border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_14%,var(--surface))]" : "border-transparent bg-[var(--soft)]"}`}>
            <span className="grid size-10 place-items-center rounded-2xl text-white" style={{ background: choice.color }}><choice.Icon size={20} strokeWidth={2.2}/></span>{choice.label}
          </button>;
        })}
      </div> : <p className="rounded-2xl bg-[var(--soft)] p-3 text-sm text-[var(--muted)]">{t("Tạo mode cho những hoạt động của riêng bạn.")}</p>}
    </section>
    <CustomModeDialog open={creating} onOpenChange={setCreating} onCreated={mode => { onCreate(mode); onSet(mode.mode); }}/>
  </DialogPanel>;
}
