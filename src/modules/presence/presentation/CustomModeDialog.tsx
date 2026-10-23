import { useEffect, useState, type FormEvent } from "react";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { errorMessage } from "../../../kernel/errors";
import type { CustomActivityMode, CustomModeIcon } from "../domain/ActivityMode";
import { customModeColors, customModeIconOptions, customModeIcons } from "./modes";
import { useCreateCustomMode } from "./useCustomModes";
import { t } from "../../../kernel/i18n";

export function CustomModeDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreated?(mode: CustomActivityMode): void;
}) {
  const create = useCreateCustomMode();
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState<CustomModeIcon>("sparkles");
  const [color, setColor] = useState<string>(customModeColors[0]);
  useEffect(() => { if (open) { setLabel(""); setIcon("sparkles"); setColor(customModeColors[0]); create.reset(); } }, [open]);

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ label: label.trim(), icon, color }, { onSuccess: mode => { onCreated?.(mode); onOpenChange(false); } });
  }

  const Icon = customModeIcons[icon];
  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={create.isPending} size="sm" title={t("Tạo mode riêng")}
    description={t("Đặt tên và chọn một biểu tượng. Bạn bè sẽ thấy mode này khi bạn bật nó.")}>
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm font-semibold">{t("Tên mode")}
        <input data-dialog-initial-focus className="field mt-1 w-full" value={label} maxLength={28} required
          onChange={event => setLabel(event.target.value)} placeholder={t("Ví dụ: Đi dạo")}/>
      </label>
      <fieldset>
        <legend className="text-sm font-semibold">{t("Biểu tượng")}</legend>
        <div className="mt-2 grid grid-cols-6 gap-2">
          {customModeIconOptions.map(option => {
            const OptionIcon = customModeIcons[option.id];
            return <button key={option.id} type="button" aria-label={option.label} aria-pressed={icon === option.id}
              title={option.label} onClick={() => setIcon(option.id)} className={`grid min-h-12 place-items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${icon === option.id ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
              <OptionIcon size={20}/>
            </button>;
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-semibold">{t("Màu sắc")}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {customModeColors.map(option => <button key={option} type="button" aria-label={t("Chọn màu {0}", option)} aria-pressed={color === option}
            onClick={() => setColor(option)} className={`grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-[var(--surface)] ${color === option ? "ring-2 ring-[var(--ink)]" : ""}`} style={{ background: option }}>
            {color === option && <Icon size={17} className="text-white"/>}
          </button>)}
        </div>
      </fieldset>
      {create.error && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(create.error, t("Chưa tạo được mode. Hãy thử lại."))}</p>}
      <button type="submit" disabled={create.isPending || !label.trim()} className="pressable inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] px-4 font-semibold text-[var(--ink)] disabled:opacity-50">
        <Icon size={18}/>{create.isPending ? t("Đang tạo…") : t("Tạo mode")}
      </button>
    </form>
  </DialogPanel>;
}
