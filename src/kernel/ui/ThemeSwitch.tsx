import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { theme, type Theme } from "../theme";
import { t } from "../i18n";

const choices: [Theme, string, typeof Sun][] = [["system", t("Tự động"), Monitor], ["light", t("Sáng"), Sun], ["dark", t("Tối"), Moon]];

/** Light, dark, or whatever the device is set to. The choice is kept on this device. */
export function ThemeSwitch() {
  const current = useSyncExternalStore(theme.subscribe, theme.get);
  return <div role="group" aria-label={t("Giao diện")} className="flex gap-1 rounded-2xl bg-[var(--soft)] p-1">
    {choices.map(([name, label, Icon]) => <button key={name} type="button" aria-pressed={current === name} onClick={() => theme.set(name)}
      className={`flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${current === name ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>
      <Icon size={15} /> {label}
    </button>)}
  </div>;
}
