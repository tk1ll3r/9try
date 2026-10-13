import { Link } from "react-router-dom";
import { warmHandlers } from "../../../kernel/module";
import { directory } from "../../../kernel/navigation";
import { useNavigation, useRegistry } from "../../../kernel/session";
import { t } from "../../../kernel/i18n";

/** Every screen by part of the app. Child screens also stay in their parent's tab strip. */
export function MenuPage() {
  const parts = directory(useNavigation());
  const { routes } = useRegistry();
  return <div className="space-y-6">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">{t("Màn hình và tab")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Menu</h1>
    </header>
    {parts.map(part => <section key={part.label} aria-label={part.label}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{part.label}</h2>
      {/* Three to a row on a phone, so that all of the app fits on one screen or a little more. */}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">{part.items.map(item => <li key={item.to} className="min-w-0">
        <Link to={item.to} {...warmHandlers(routes, item.to)} className="pressable flex h-full min-h-[5.5rem] flex-col items-center justify-start gap-2 rounded-2xl border border-black/8 bg-[var(--surface)] px-1.5 py-3 text-center text-sm font-semibold leading-tight dark:border-white/8">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--soft)]"><item.icon size={20} />{item.badge && <item.badge />}</span>
          <span className="line-clamp-2 max-w-full break-words">{item.label}</span>
        </Link>
      </li>)}</ul>
    </section>)}
  </div>;
}
