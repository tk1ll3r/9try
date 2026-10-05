import { Bell, CalendarDays, CircleUserRound, Home, MapPin, Users, UsersRound, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

const primary = [
  ["/", "Trang chủ", Home],
  ["/groups", "Nhóm", UsersRound],
  ["/calendar", "Lịch", CalendarDays],
  ["/notifications", "Thông báo", Bell],
  ["/me", "Tôi", CircleUserRound],
] as const;

const secondary = [
  ["/meetups", "Hoạt động", CalendarDays],
  ["/me/friends", "Bạn bè", Users],
  ["/me/location", "Chia sẻ vị trí", MapPin],
] as const;

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

export function AppShell() {
  const [online, setOnline] = useState(navigator.onLine);

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

  return (
    <div className="min-h-dvh bg-[var(--paper)] text-[var(--ink)]">
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950">
          <WifiOff size={16} /> Đang ngoại tuyến. Dữ liệu riêng tư mới sẽ không được đồng bộ cho tới khi có mạng.
        </div>
      )}

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-black/8 bg-[var(--surface)] p-5 lg:flex lg:flex-col dark:border-white/8">
        <Brand />
        <nav className="mt-8 space-y-1">
          {primary.map(([to, label, Icon]) => <SideLink key={to} to={to} label={label} Icon={Icon} />)}
        </nav>
        <div className="my-4 border-t border-black/8 dark:border-white/8" />
        <nav className="space-y-1">
          {secondary.map(([to, label, Icon]) => <SideLink key={to} to={to} label={label} Icon={Icon} />)}
        </nav>
      </aside>

      <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-28 pt-5 sm:px-6 lg:ml-64 lg:px-8 lg:pb-10 lg:pt-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-[26px] border border-black/8 bg-[var(--surface)] p-1.5 shadow-2xl lg:hidden dark:border-white/8">
        {primary.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            end={to === "/"}
            to={to}
            className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold ${isActive ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"}`}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function SideLink({ to, label, Icon }: { to: string; label: string; Icon: typeof Home }) {
  return (
    <NavLink
      end={to === "/"}
      to={to}
      className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${isActive ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)] hover:bg-[var(--soft)]"}`}
    >
      <Icon size={19} />
      {label}
    </NavLink>
  );
}
