import { useIsFetching } from "@tanstack/react-query";
import { CalendarDays, Home, MessageCircle, Radio, Search, UsersRound, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { NavContribution, NavTab } from "../kernel/module";
import { useRegistry } from "../kernel/session";
import { AccountMenu } from "../modules/identity";

// Opened rarely, so its dialog code stays out of the first download.
const SearchDialog = lazy(() => import("./SearchDialog").then(m => ({ default: m.SearchDialog })));

// Mode comes first: seeing what everyone is doing is what the app is opened for.
const tabs: { id: NavTab; label: string; icon: NavContribution["icon"] }[] = [
  { id: "mode", label: "Mode", icon: Radio },
  { id: "today", label: "Hôm nay", icon: Home },
  { id: "plan", label: "Kế hoạch", icon: CalendarDays },
  { id: "chat", label: "Trò chuyện", icon: MessageCircle },
  { id: "together", label: "Cùng nhau", icon: UsersRound },
];
// The two other tabs are not in this list. "inbox" is the bell and "me" the account menu, both in the
// top right corner of every screen; a phone's bottom bar then has room for the five above.

const isAt = (pathname: string, to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-2xl bg-[#171a12] font-black text-[#d9ff79] shadow-[0_8px_24px_-8px_var(--lime-strong)]">G</div>
      <div>
        <b>Gnouht Together</b>
        <p className="text-xs text-[var(--muted)]">Mình gặp nhau nhé.</p>
      </div>
    </div>
  );
}

function Badges({ items }: { items: readonly NavContribution[] }) {
  return <>{items.map(({ to, badge: Badge }) => Badge && <Badge key={to} />)}</>;
}

/** What a screen shows while its code is on the way. */
function PageSkeleton() {
  return <div role="status" aria-label="Đang tải trang" className="space-y-5">
    <div className="skeleton h-5 w-40" /><div className="skeleton h-12 w-3/4" /><div className="skeleton h-44" /><div className="skeleton h-32" />
  </div>;
}

/**
 * Navigation comes from the modules: bottom tabs with a row of sub-screens on a phone, a sidebar on a
 * desktop, and on both the bell and the account menu in the top right corner.
 */
export function AppShell() {
  const [online, setOnline] = useState(navigator.onLine);
  const [searching, setSearching] = useState(false);
  const { navigation, modules } = useRegistry();
  const { pathname } = useLocation();
  const fetching = useIsFetching();

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
  // The menu lists the screens that stand on their own. A screen with a `parent` is a tab on that parent's screen.
  const parentOf = (item: NavContribution) => navigation.find(other => other.to === item.parent && other !== item);
  const menu = navigation.filter(item => !parentOf(item));
  const section = current && (parentOf(current) ?? current);
  const family = section ? [section, ...navigation.filter(item => item !== section && parentOf(item) === section)] : [];
  const groups = tabs.map(tab => ({ ...tab, items: menu.filter(item => item.tab === tab.id) })).filter(tab => tab.items.length);
  const siblings = groups.find(tab => tab.id === section?.tab)?.items ?? [];
  const activeIndex = groups.findIndex(tab => tab.id === section?.tab);
  const inbox = menu.filter(item => item.tab === "inbox");
  const bell = inbox[0];
  // The account menu lists every screen about the person, also the ones that are tabs of the profile.
  const mine = navigation.filter(item => item.tab === "me");

  // On a phone the row of sub-screens scrolls sideways; keep the current one in the middle of it.
  const pills = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = pills.current;
    const active = row?.querySelector<HTMLElement>("[aria-current]");
    if (row && active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [section?.to]);

  return (
    <div className="relative min-h-dvh bg-[var(--paper)] text-[var(--ink)]">
      <div className="aurora" aria-hidden><i /><i /><i /></div>
      {fetching > 0 && <div className="loading-bar" aria-hidden />}
      {!online && (
        <div className="animate-slide-up fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950">
          <WifiOff size={16} /> Đang ngoại tuyến. Dữ liệu riêng tư mới sẽ không được đồng bộ cho tới khi có mạng.
        </div>
      )}

      <aside className="glass fixed inset-y-0 left-0 z-10 hidden w-64 overflow-y-auto border-r border-black/8 p-5 lg:block dark:border-white/8">
        <Brand />
        <button type="button" onClick={() => setSearching(true)} className="pressable mt-6 flex min-h-11 w-full items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm text-[var(--muted)]">
          <Search size={17} /> Tìm kiếm <kbd className="ml-auto text-xs">Ctrl K</kbd>
        </button>
        <nav aria-label="Điều hướng chính" className="mt-5 space-y-5">
          {groups.map(group => (
            <div key={group.id} className="space-y-1">
              {group.items.length > 1 && <p className="px-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.label}</p>}
              {group.items.map(item => (
                <Link key={item.to} to={item.to} aria-current={item === current ? "page" : item === section ? "true" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-[var(--ease-out)] ${item === section ? "bg-[var(--ink)] text-[var(--paper)] shadow-lg" : "text-[var(--muted)] hover:translate-x-1 hover:bg-[var(--soft)]"}`}>
                  <span className="relative"><item.icon size={19} />{item.badge && <item.badge />}</span>
                  {group.items.length > 1 ? item.label : group.label}
                  {group.id === "mode" && <span aria-hidden className="relative ml-auto grid size-2.5 place-items-center"><span className="absolute inset-0 animate-ping rounded-full bg-[var(--lime-strong)] opacity-70" /><span className="size-2.5 rounded-full bg-[var(--lime-strong)]" /></span>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="relative z-[1] mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        {/* One bar for every screen size. A phone has search, the bell and the account on its first row and
            the rows of sub-screens under it. A desktop has the tabs of the current screen on the left. */}
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-4">
          <button type="button" onClick={() => setSearching(true)} className="glass pressable order-1 flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-black/5 px-4 text-sm text-[var(--muted)] lg:hidden dark:border-white/8"><Search size={17} /> Tìm kiếm</button>
          <div className="order-2 flex shrink-0 items-center gap-2 lg:order-3 lg:ml-auto">
            {bell && (
              <Link to={bell.to} aria-label={bell.label} aria-current={section?.tab === "inbox" ? "page" : undefined}
                className={`pressable grid size-11 place-items-center rounded-full border border-black/5 dark:border-white/8 ${section?.tab === "inbox" ? "bg-[var(--ink)] text-[var(--paper)]" : "glass"}`}>
                <span className="relative"><bell.icon size={20} /><Badges items={inbox} /></span>
              </Link>
            )}
            <AccountMenu items={mine} active={section?.tab === "me"} />
          </div>
          <div className="order-3 w-full empty:hidden">{modules.map(({ id, indicator: Indicator }) => Indicator && <Indicator key={id} />)}</div>
          {siblings.length > 1 && (
            <nav ref={pills} aria-label="Trong mục này" className="relative order-4 -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:hidden">
              {siblings.map(item => (
                <Link key={item.to} to={item.to} aria-current={item === current ? "page" : item === section ? "true" : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${item === section ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                  <item.icon size={16} /> {item.label}
                </Link>
              ))}
            </nav>
          )}
          {/* The screens that share one menu entry, as tabs: "Việc · Thói quen · Ghi chú". */}
          {family.length > 1 && (
            <nav aria-label="Trong màn này" className="order-5 flex w-full max-w-full gap-1 overflow-x-auto rounded-2xl bg-[var(--soft)] p-1 sm:w-auto lg:order-1">
              {family.map(item => (
                <Link key={item.to} to={item.to} aria-current={item === current ? "page" : undefined}
                  className={`inline-flex min-h-9 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 sm:flex-none ${item === current ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>
                  <item.icon size={15} /> {item.label}
                </Link>
              ))}
            </nav>
          )}
        </div>
        {/* The shell stays while a screen's code loads; the screen's parts then arrive one after the other. */}
        <div className="page-slot"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></div>
      </main>

      {searching && <Suspense fallback={null}><SearchDialog open onOpenChange={setSearching} /></Suspense>}

      <nav aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid rounded-[26px] border border-black/8 p-1.5 shadow-2xl lg:hidden dark:border-white/10">
        {/* One dark pill slides under the current tab. */}
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-2xl bg-[var(--ink)] shadow-lg transition-[transform,opacity] duration-500 ease-[var(--ease-spring)]"
          style={{ width: `calc((100% - 0.75rem) / ${groups.length})`, transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex < 0 ? 0 : 1 }} />
        {groups.map(tab => {
          const active = tab.id === section?.tab;
          return (
            <Link key={tab.id} to={tab.items[0].to} aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition-colors duration-300 active:scale-95 ${active ? "text-[var(--paper)]" : "text-[var(--muted)]"}`}>
              <span className={`relative transition-transform duration-500 ease-[var(--ease-spring)] ${active ? "-translate-y-0.5 scale-110" : ""}`}>
                <tab.icon size={20} /><Badges items={tab.items} />
                {tab.id === "mode" && !active && <span aria-hidden className="absolute -right-1 -top-0.5 size-2 rounded-full bg-[var(--lime-strong)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--lime-strong)_30%,transparent)]" />}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
