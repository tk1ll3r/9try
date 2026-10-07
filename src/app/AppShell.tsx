import { Bell, CalendarDays, CircleUserRound, Home, MessageCircle, UsersRound, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { NavContribution, NavTab } from "../kernel/module";
import { useRegistry } from "../kernel/session";

const tabs: { id: NavTab; label: string; icon: NavContribution["icon"] }[] = [
  { id: "today", label: "Hôm nay", icon: Home },
  { id: "plan", label: "Kế hoạch", icon: CalendarDays },
  { id: "chat", label: "Trò chuyện", icon: MessageCircle },
  { id: "together", label: "Cùng nhau", icon: UsersRound },
  { id: "inbox", label: "Thông báo", icon: Bell },
  { id: "me", label: "Tôi", icon: CircleUserRound },
];

const isAt = (pathname: string, to: string) => to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-10 place-items-center rounded-2xl bg-[var(--ink)] font-black text-[var(--lime)]">G</div>
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

/** Navigation comes from the modules: bottom tabs with a row of sub-screens on a phone, a sidebar on a desktop. */
export function AppShell() {
  const [online, setOnline] = useState(navigator.onLine);
  const { navigation } = useRegistry();
  const { pathname } = useLocation();

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // The current screen is the one whose path is the longest prefix of the address.
  const current = navigation.filter(item => isAt(pathname, item.to)).sort((a, b) => b.to.length - a.to.length)[0];
  const groups = tabs.map(tab => ({ ...tab, items: navigation.filter(item => item.tab === tab.id) })).filter(tab => tab.items.length);
  // A phone fits five tabs. Once a chat module exists, notifications move to the bell at the top.
  const hasChat = groups.some(tab => tab.id === "chat");
  const phoneTabs = hasChat ? groups.filter(tab => tab.id !== "inbox") : groups;
  const inbox = groups.find(tab => tab.id === "inbox");
  const siblings = groups.find(tab => tab.id === current?.tab)?.items ?? [];

  return (
    <div className="min-h-dvh bg-[var(--paper)] text-[var(--ink)]">
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950">
          <WifiOff size={16} /> Đang ngoại tuyến. Dữ liệu riêng tư mới sẽ không được đồng bộ cho tới khi có mạng.
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-64 overflow-y-auto border-r border-black/8 bg-[var(--surface)] p-5 lg:block dark:border-white/8">
        <Brand />
        <nav aria-label="Điều hướng chính" className="mt-8 space-y-5">
          {groups.map(group => (
            <div key={group.id} className="space-y-1">
              {group.items.length > 1 && <p className="px-3 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.label}</p>}
              {group.items.map(item => (
                <Link key={item.to} to={item.to} aria-current={item === current ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${item === current ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)] hover:bg-[var(--soft)]"}`}>
                  <span className="relative"><item.icon size={19} />{item.badge && <item.badge />}</span>
                  {group.items.length > 1 ? item.label : group.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {hasChat && inbox && (
        <Link to={inbox.items[0].to} aria-label={inbox.label} className="fixed right-3 top-3 z-40 grid size-11 place-items-center rounded-full border border-black/8 bg-[var(--surface)] shadow-lg lg:hidden dark:border-white/8">
          <span className="relative"><Bell size={20} /><Badges items={inbox.items} /></span>
        </Link>
      )}

      <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        {siblings.length > 1 && (
          <nav aria-label="Trong mục này" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
            {siblings.map(item => (
              <Link key={item.to} to={item.to} aria-current={item === current ? "page" : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${item === current ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
                <item.icon size={16} /> {item.label}
              </Link>
            ))}
          </nav>
        )}
        <Outlet />
      </main>

      <nav aria-label="Điều hướng chính" style={{ gridTemplateColumns: `repeat(${phoneTabs.length}, minmax(0, 1fr))` }}
        className="fixed inset-x-3 bottom-3 z-40 grid rounded-[26px] border border-black/8 bg-[var(--surface)] p-1.5 shadow-2xl lg:hidden dark:border-white/8">
        {phoneTabs.map(tab => {
          const active = tab.id === current?.tab;
          return (
            <Link key={tab.id} to={tab.items[0].to} aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold ${active ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"}`}>
              <span className="relative"><tab.icon size={20} /><Badges items={tab.items} /></span>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
