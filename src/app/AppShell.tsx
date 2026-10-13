import { useIsFetching } from "@tanstack/react-query";
import { Search, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { preloadRoute, warmHandlers, type NavContribution } from "../kernel/module";
import { directory, primaryScreens } from "../kernel/navigation";
import { useNavigation, useRegistry } from "../kernel/session";
import { AccountMenu } from "../modules/identity";
import { t } from "../kernel/i18n";

// Opened rarely, so its dialog code stays out of the first download.
const SearchDialog = lazy(() => import("./SearchDialog").then(m => ({ default: m.SearchDialog })));

const isAt = (pathname: string, to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-pink-500 to-rose-600 font-black text-white shadow-[0_8px_24px_-8px_var(--lime-strong)]">G</div>
      <div>
        <b>Gnouht Together</b>
        <p className="text-xs text-[var(--muted)]">{t("Mình gặp nhau nhé.")}</p>
      </div>
    </div>
  );
}

/** What a screen shows while its code is on the way. */
function PageSkeleton() {
  return <div role="status" aria-label={t("Đang tải trang")} className="space-y-5">
    <div className="skeleton h-5 w-40" /><div className="skeleton h-12 w-3/4" /><div className="skeleton h-44" /><div className="skeleton h-32" />
  </div>;
}

/**
 * Navigation comes from the modules. A phone has five screens in a bar at the bottom: Mode first,
 * because seeing what everyone is doing is what the app is opened for, and the Menu last, which
 * lists every screen. Child tabs also stay under their parent; the bell and account screens keep
 * their fixed buttons in the top right corner.
 */
export function AppShell() {
  const [online, setOnline] = useState(navigator.onLine);
  const [searching, setSearching] = useState(false);
  const { modules, routes } = useRegistry();
  const navigation = useNavigation();
  const { pathname } = useLocation();
  // A refresh of data the screen already shows stays quiet. The bar is for the first load, when there is nothing to draw yet.
  const fetching = useIsFetching({ predicate: query => query.state.data === undefined });

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearching(true); }
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("keydown", key);
    };
  }, []);

  // The current screen is the one whose path is the longest prefix of the address.
  const current = navigation.filter(item => isAt(pathname, item.to)).sort((a, b) => b.to.length - a.to.length)[0];
  // A screen with a `parent` is a tab on that parent's screen, in a strip above the page.
  const parentOf = (item: NavContribution) => navigation.find(other => other.to === item.parent && other !== item);
  const section = current && (parentOf(current) ?? current);
  const family = section ? [section, ...navigation.filter(item => item !== section && parentOf(item) === section)] : [];
  const primary = primaryScreens(navigation);
  const bell = navigation.find(item => item.tab === "inbox" && !parentOf(item));
  // The account menu lists every screen about the person, also the ones that are tabs of the profile.
  const mine = navigation.filter(item => item.tab === "me");
  // The sidebar: the five screens of the bottom bar, then the others that stand on their own, then the Menu.
  const others = directory(navigation).flatMap(part => part.items).filter(item => !parentOf(item) && item.primary === undefined && item.tab !== "inbox" && item.tab !== "me");
  const side = [...primary.filter(item => item.tab !== "menu"), ...others, ...primary.filter(item => item.tab === "menu")];
  // The lit tab of the bottom bar: the screen's own, or the Menu for a screen that is reached through it.
  const lit = !section || section.tab === "inbox" || section.tab === "me" ? undefined : section.primary !== undefined ? section : primary.find(item => item.tab === "menu");
  const litIndex = lit ? primary.indexOf(lit) : -1;
  // After the home screen is up, the other bottom-bar screens start downloading. The map stays out of that:
  // its code is about a megabyte, and it starts when the finger reaches that tab.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const item of primaryScreens(navigation)) if (item.to !== "/" && item.to !== "/me/location") preloadRoute(routes, item.to);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [navigation, routes]);

  return (
    <div className="relative min-h-dvh bg-[var(--paper)] text-[var(--ink)]">
      <div className="aurora aurora-still" aria-hidden><i /><i /><i /></div>
      {fetching > 0 && <div className="loading-bar" aria-hidden />}
      {!online && (
        <div className="animate-slide-up fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950">
          <WifiOff size={16} /> {t("Đang ngoại tuyến. Dữ liệu riêng tư mới sẽ không được đồng bộ cho tới khi có mạng.")}
        </div>
      )}

      <aside className="glass fixed inset-y-0 left-0 z-10 hidden w-64 overflow-y-auto border-r border-black/8 p-5 lg:block dark:border-white/8">
        <Brand />
        <button type="button" onClick={() => setSearching(true)} className="pressable mt-6 flex min-h-11 w-full items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm text-[var(--muted)]">
          <Search size={17} /> {t("Tìm kiếm")} <kbd className="ml-auto text-xs">Ctrl K</kbd>
        </button>
        <nav aria-label={t("Điều hướng chính")} className="mt-5 space-y-1">
          {side.map((item, index) => (
            <Link key={item.to} to={item.to} {...warmHandlers(routes, item.to)} aria-current={item === current ? "page" : item === section ? "true" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-[var(--ease-out)] ${index === primary.length - 1 ? "mt-3" : ""} ${item === section ? "bg-[var(--ink)] text-[var(--paper)] shadow-lg" : "text-[var(--muted)] hover:translate-x-1 hover:bg-[var(--soft)]"}`}>
              <span className="relative"><item.icon size={19} />{item.badge && <item.badge />}</span>
              {item.label}
              {item.tab === "mode" && <span aria-hidden className="ml-auto size-2.5 rounded-full bg-[var(--lime-strong)]" />}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="app-main relative z-[1] mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        {/* One bar for every screen size. A phone has search, the bell and the account on its first row and
            the tabs of the current screen under it. A desktop has those tabs on the left. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-4">
          <button type="button" onClick={() => setSearching(true)} className="glass pressable order-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-black/5 px-4 text-sm text-[var(--muted)] lg:hidden dark:border-white/8"><Search size={17} /> {t("Tìm kiếm")}</button>
          <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3 lg:ml-auto">
            {bell && (
              <Link to={bell.to} {...warmHandlers(routes, bell.to)} aria-label={bell.label} aria-current={section?.tab === "inbox" ? "page" : undefined}
                className={`pressable grid size-11 place-items-center rounded-full border border-black/5 dark:border-white/8 ${section?.tab === "inbox" ? "bg-[var(--ink)] text-[var(--paper)]" : "glass"}`}>
                <span className="relative"><bell.icon size={20} />{bell.badge && <bell.badge />}</span>
              </Link>
            )}
            <AccountMenu items={mine} active={section?.tab === "me"} />
          </div>
          <div className="order-3 w-full empty:hidden">{modules.map(({ id, indicator: Indicator }) => Indicator && <Indicator key={id} />)}</div>
          {/* Child screens stay grouped under their parent page. */}
          {family.length > 1 && (
            <nav aria-label={t("Trong màn này")} className="order-4 flex w-full max-w-full gap-1 overflow-x-auto rounded-2xl bg-[var(--soft)] p-1 sm:w-auto lg:order-1">
              {family.map(item => (
                <Link key={item.to} to={item.to} {...warmHandlers(routes, item.to)} aria-current={item === current ? "page" : undefined}
                  className={`inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 sm:flex-none ${item === current ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>
                  <span className="relative"><item.icon size={15} />{item !== section && item.badge && <item.badge />}</span> {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {/* The shell stays while a screen's code loads. A press on its link has usually started that download already. */}
        <div className="page-slot"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></div>
      </main>

      {searching && <Suspense fallback={null}><SearchDialog open onOpenChange={setSearching} /></Suspense>}

      <nav aria-label={t("Điều hướng chính")} style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}
        className="app-mobile-nav fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid rounded-[26px] border border-black/8 bg-[var(--surface)] p-1.5 shadow-2xl lg:hidden dark:border-white/10 touch-none overscroll-contain">
        {/* One dark pill slides under the current tab. */}
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-2xl bg-[var(--ink)] shadow-lg transition-[transform,opacity] duration-200 ease-[var(--ease-out)]"
          style={{ width: `calc((100% - 0.75rem) / ${primary.length})`, transform: `translateX(${Math.max(litIndex, 0) * 100}%)`, opacity: litIndex < 0 ? 0 : 1 }} />
        {primary.map(item => {
          const active = item === lit;
          return (
            <Link key={item.to} to={item.to} {...warmHandlers(routes, item.to)} aria-current={item === current ? "page" : active ? "true" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl text-[11px] font-semibold transition-colors duration-200 active:scale-95 max-[359px]:text-[10px] max-[359px]:tracking-tight ${active ? "text-[var(--paper)]" : "text-[var(--muted)]"}`}>
              <span className={`relative transition-transform duration-200 ease-[var(--ease-out)] ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                <item.icon size={20} />{item.badge && <item.badge />}
                {item.tab === "mode" && !active && <span aria-hidden className="absolute -right-1 -top-0.5 size-2 rounded-full bg-[var(--lime-strong)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--lime-strong)_30%,transparent)]" />}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
