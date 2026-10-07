import { useIsFetching } from "@tanstack/react-query";
import { Bell, CalendarDays, CircleUserRound, Home, MessageCircle, Radio, Search, UsersRound, WifiOff } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { NavContribution, NavTab } from "../kernel/module";
import { useRegistry } from "../kernel/session";

// Opened rarely, so its dialog code stays out of the first download.
const SearchDialog = lazy(() => import("./SearchDialog").then(m => ({ default: m.SearchDialog })));

// Mode comes first: seeing what everyone is doing is what the app is opened for.
const tabs: { id: NavTab; label: string; icon: NavContribution["icon"] }[] = [
  { id: "mode", label: "Mode", icon: Radio },
  { id: "today", label: "Hôm nay", icon: Home },
  { id: "plan", label: "Kế hoạch", icon: CalendarDays },
  { id: "chat", label: "Trò chuyện", icon: MessageCircle },
  { id: "together", label: "Cùng nhau", icon: UsersRound },
  { id: "inbox", label: "Thông báo", icon: Bell },
  { id: "me", label: "Tôi", icon: CircleUserRound },
];
/** A phone's bottom bar fits five tabs. The inbox and the profile sit in the top bar instead. */
const topBarTabs: NavTab[] = ["inbox", "me"];

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

/** Navigation comes from the modules: bottom tabs with a row of sub-screens on a phone, a sidebar on a desktop. */
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
  const groups = tabs.map(tab => ({ ...tab, items: navigation.filter(item => item.tab === tab.id) })).filter(tab => tab.items.length);
  const phoneTabs = groups.filter(tab => !topBarTabs.includes(tab.id));
  const topBar = groups.filter(tab => topBarTabs.includes(tab.id));
  const siblings = groups.find(tab => tab.id === current?.tab)?.items ?? [];
  const activeIndex = phoneTabs.findIndex(tab => tab.id === current?.tab);

  // On a phone the row of sub-screens scrolls sideways; keep the current one in the middle of it.
  const pills = useRef<HTMLElement>(null);
  useEffect(() => {
    const row = pills.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && active) row.scrollLeft = active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [current?.to]);

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
                <Link key={item.to} to={item.to} aria-current={item === current ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-[background-color,color,transform] duration-200 ease-[var(--ease-out)] ${item === current ? "bg-[var(--ink)] text-[var(--paper)] shadow-lg" : "text-[var(--muted)] hover:translate-x-1 hover:bg-[var(--soft)]"}`}>
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
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <button type="button" onClick={() => setSearching(true)} className="glass pressable flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-full border border-black/5 px-4 text-sm text-[var(--muted)] dark:border-white/8"><Search size={17} /> Tìm kiếm</button>
          {topBar.map(tab => (
            <Link key={tab.id} to={tab.items[0].to} aria-label={tab.label} aria-current={current?.tab === tab.id ? "page" : undefined}
              className={`pressable grid size-11 shrink-0 place-items-center rounded-full border border-black/5 dark:border-white/8 ${current?.tab === tab.id ? "bg-[var(--ink)] text-[var(--paper)]" : "glass"}`}>
              <span className="relative"><tab.icon size={20} /><Badges items={tab.items} /></span>
            </Link>
          ))}
        </div>
        {modules.map(({ id, indicator: Indicator }) => Indicator && <Indicator key={id} />)}
        {siblings.length > 1 && (
          <nav ref={pills} aria-label="Trong mục này" className="relative -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
            {siblings.map(item => (
              <Link key={item.to} to={item.to} aria-current={item === current ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${item === current ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                <item.icon size={16} /> {item.label}
              </Link>
            ))}
          </nav>
        )}
        {/* The shell stays while a screen's code loads; the screen's parts then arrive one after the other. */}
        <div className="page-slot"><Suspense fallback={<PageSkeleton />}><Outlet /></Suspense></div>
      </main>

      {searching && <Suspense fallback={null}><SearchDialog open onOpenChange={setSearching} /></Suspense>}

      <nav aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${phoneTabs.length}, minmax(0, 1fr))` }}
        className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 grid rounded-[26px] border border-black/8 p-1.5 shadow-2xl lg:hidden dark:border-white/10">
        {/* One dark pill slides under the current tab. */}
        <span aria-hidden className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-2xl bg-[var(--ink)] shadow-lg transition-[transform,opacity] duration-500 ease-[var(--ease-spring)]"
          style={{ width: `calc((100% - 0.75rem) / ${phoneTabs.length})`, transform: `translateX(${Math.max(activeIndex, 0) * 100}%)`, opacity: activeIndex < 0 ? 0 : 1 }} />
        {phoneTabs.map(tab => {
          const active = tab.id === current?.tab;
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
