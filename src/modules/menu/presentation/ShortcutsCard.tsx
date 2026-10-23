import { useState } from "react";
import { Link } from "react-router-dom";
import { warmHandlers } from "../../../kernel/module";
import { useNavigation, useRegistry, useUserId } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { pickShortcuts, shortcutLimit, toggleShortcut } from "../domain/shortcuts";
import { t } from "../../../kernel/i18n";

const keyOf = (userId: string) => `gnouht-shortcuts:${userId}`;
function kept(userId: string): string[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(keyOf(userId)) ?? "null");
    return Array.isArray(value) ? value.filter(item => typeof item === "string") : null;
  } catch { return null; }
}

/**
 * Today's first card: the screens this person opens most, one tap away. "Sửa" turns the card into the
 * list of destinations they can pin. The choice stays on this device.
 */
export function ShortcutsCard() {
  const userId = useUserId();
  const { routes } = useRegistry();
  // Today itself is where the card is, so it is not offered.
  const screens = useNavigation().filter(item => item.to !== "/today" && item.tab !== "inbox" && item.tab !== "me" && item.tab !== "menu");
  const [chosen, setChosen] = useState(() => kept(userId));
  const [editing, setEditing] = useState(false);
  const shown = pickShortcuts(screens, chosen);

  function toggle(to: string) {
    const next = toggleShortcut(shown.map(item => item.to), to);
    setChosen(next);
    try { localStorage.setItem(keyOf(userId), JSON.stringify(next)); } catch { /* The choice then lasts for this visit only. */ }
  }

  return <Card title={t("Lối tắt")} action={<Button variant="ghost" className="min-h-11 px-3 py-1.5" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? t("Xong") : t("Sửa")}</Button>}>
    {editing ? <>
      <p className="mb-3 text-sm text-[var(--muted)]">{t("Chọn tối đa {0} màn hình để mở nhanh từ đây. Đang chọn {1}.", shortcutLimit, shown.length)}</p>
      <ul className="flex flex-wrap gap-2">{screens.map(item => {
        const on = shown.includes(item);
        return <li key={item.to}><button type="button" aria-pressed={on} disabled={!on && shown.length >= shortcutLimit} onClick={() => toggle(item.to)}
          className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 disabled:opacity-40 ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
          <item.icon size={16} /> {item.label}
        </button></li>;
      })}</ul>
    </> : shown.length ? <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8 xl:grid-cols-4">{shown.map(item => <li key={item.to} className="min-w-0">
      <Link to={item.to} {...warmHandlers(routes, item.to)} className="pressable flex min-h-[4.5rem] flex-col items-center justify-start gap-1.5 rounded-2xl p-1.5 text-center text-xs font-semibold leading-tight hover:bg-[var(--soft)]">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--soft)]"><item.icon size={20} />{item.badge && <item.badge />}</span>
        <span className="line-clamp-2 max-w-full break-words">{item.label}</span>
      </Link>
    </li>)}</ul> : <p className="text-sm text-[var(--muted)]">{t("Chưa có lối tắt nào. Bấm “Sửa” để chọn.")}</p>}
  </Card>;
}
