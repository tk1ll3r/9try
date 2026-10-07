import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, Radio, UserPlus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useFriendSignals, useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { useFlip } from "../../../kernel/useFlip";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends, useFriendPins } from "../../friends";
import type { ActivityMode } from "../domain/ActivityMode";
import { featured, FriendRanking, type RankedFriend } from "../domain/FriendRanking";
import { presenceModule } from "../presence.module";
import { FeaturedFriend, FriendRow } from "./FriendCard";
import { MemberAvatar } from "./MemberAvatar";
import { choiceOf, choices, presenceKey, quickDefaults } from "./modes";
import { MyModeHero } from "./MyModeHero";

// Opened now and then, so the dialog code stays out of the home screen's download.
const ModePicker = lazy(() => import("./ModePicker").then(m => ({ default: m.ModePicker })));

const ranking = new FriendRanking();
const minutesKey = "gnouht-mode-minutes";
const recentKey = "gnouht-mode-recent";
/** How many activities the one-tap row offers. */
const quickCount = 5;
/** Friends without a mode shown before "Xem thêm". */
const idleShown = 8;

function rememberedMinutes(): number {
  try { return Number(localStorage.getItem(minutesKey)) || 120; } catch { return 120; }
}
/** The activities this person turned on last, on this device. */
function rememberedRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(recentKey) ?? "[]") as string[]; } catch { return []; }
}

/**
 * The app's home screen: what each friend is doing right now. The friends who matter most at this
 * moment (a meetup soon, unread messages, a live location, a pin) come first, each with the reason.
 */
export function ModePage() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const friends = useAcceptedFriends();
  const pins = useFriendPins();
  const loadSignals = useFriendSignals();
  // The realtime "presence" event reloads both at once; the timers cover a missed event.
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list(), refetchInterval: 20_000 });
  const signals = useQuery({ queryKey: [...presenceKey, "signals"], queryFn: loadSignals, refetchInterval: 30_000 });
  const { run, pending, error } = useAction(presenceKey);
  const [minutes, setMinutes] = useState(rememberedMinutes);
  const [recent, setRecent] = useState(rememberedRecent);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showIdle, setShowIdle] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Modes end by the clock, so the screen looks at the clock twice a minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const mine = (list.data ?? []).find(item => item.userId === userId && Date.parse(item.expiresAt) > now);
  const ranked = useMemo(() => ranking.rank(friends, list.data ?? [], signals.data ?? [], pins.pinned, new Date(now)),
    [friends, list.data, signals.data, pins.pinned, now]);

  const hasMeetup = (item: RankedFriend) => item.reasons.some(reason => reason.kind === "meetup" || reason.kind === "invite");
  const active = ranked.filter(item => item.mode);
  const filters = [
    { id: "all", label: "Tất cả", count: ranked.length, Icon: undefined, color: undefined },
    { id: "meetup", label: "Có hẹn", count: ranked.filter(hasMeetup).length, Icon: CalendarCheck2, color: "var(--ink)" },
    ...choices.map(choice => ({ id: choice.id, label: choice.label, count: active.filter(item => item.mode!.mode === choice.id).length, Icon: choice.Icon, color: choice.color })),
  ].filter(item => item.id === "all" || item.count > 0);
  // The activities offered for one tap: the ones used last on this device, then the usual ones.
  const quick = [...new Set([...recent, ...quickDefaults])].flatMap(id => choices.find(choice => choice.id === id) ?? []).slice(0, quickCount);
  // A filter whose last person left falls back to everyone.
  const shown = filters.some(item => item.id === filter) ? filter : "all";
  const visible = ranked.filter(item => shown === "all" || (shown === "meetup" ? hasMeetup(item) : item.mode?.mode === shown));
  const top = shown === "all" ? featured(visible) : [];
  const rest = visible.filter(item => !top.includes(item));
  const idle = rest.filter(item => !item.mode);
  const rows = showIdle ? rest : [...rest.filter(item => item.mode), ...idle.slice(0, idleShown)];
  const board = useFlip<HTMLDivElement>(visible.map(item => item.friend.userId).join());
  const problem = error || pins.error || (list.isError ? errorMessage(list.error, "Không tải được mode.") : "");

  function setMode(mode: ActivityMode | null) {
    run(() => presence.set(mode, minutes), () => {
      setPicking(false);
      if (!mode) return;
      const next = [mode, ...recent.filter(id => id !== mode)].slice(0, quickCount);
      setRecent(next);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* The row then keeps the usual activities. */ }
    });
  }
  function chooseMinutes(value: number) {
    setMinutes(value);
    try { localStorage.setItem(minutesKey, String(value)); } catch { /* The choice then lasts for this visit only. */ }
  }

  return <div className="space-y-4">
    <header>
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><Radio size={16} className="text-[var(--lime-strong)]" /> {friends.length ? `${active.length}/${friends.length} bạn đang bật mode` : "Tự chọn, tự tắt, chỉ bạn bè thấy"}</p>
      <h1 className="mt-1 text-3xl font-black tracking-[-.04em] sm:text-4xl">Mọi người đang làm gì?</h1>
    </header>

    <MyModeHero mine={mine} now={now} minutes={minutes} quick={quick} pending={pending} onSet={setMode} onPick={() => setPicking(true)} />
    {picking && <Suspense fallback={null}><ModePicker open onOpenChange={setPicking} mine={mine} minutes={minutes} onMinutes={chooseMinutes} pending={pending} onSet={setMode} /></Suspense>}

    {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}

    {/* Everyone who has a mode on, at a glance: a face, a ring in the activity's color and its icon. */}
    {active.length > 0 && <section aria-label="Đang hoạt động">
      <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Đang hoạt động · {active.length}</h2>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-2 sm:mx-0 sm:px-1">
        {active.map(item => {
          const choice = choiceOf(item.mode!.mode)!;
          return <li key={item.friend.userId} className="w-[4.75rem] shrink-0">
            <Link to={`/chat/with/${item.friend.userId}`} aria-label={`${item.friend.displayName}: ${choice.label}`} className="pressable flex flex-col items-center gap-1.5 text-center">
              <MemberAvatar name={item.friend.displayName} choice={choice} />
              <b className="max-w-full truncate text-sm">{item.friend.displayName}</b>
              <span className="-mt-1.5 max-w-full truncate text-[11px] text-[var(--muted)]">{choice.label}</span>
            </Link>
          </li>;
        })}
      </ul>
    </section>}

    {friends.length > 0 && filters.length > 1 && <div role="group" aria-label="Lọc bạn bè" className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
      {filters.map(item => <button key={item.id} type="button" aria-pressed={shown === item.id} onClick={() => setFilter(item.id)}
        className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors duration-200 ${shown === item.id ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>
        {item.Icon && <item.Icon size={15} style={shown === item.id ? undefined : { color: item.color }} />}
        {item.label}{item.id !== "all" && ` · ${item.count}`}
      </button>)}
    </div>}

    <div ref={board} className="space-y-4">
      {top.length > 0 && <section aria-label="Nổi bật">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Nổi bật</h2>
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{top.map(item => <FeaturedFriend key={item.friend.userId} item={item} now={now} pins={pins} />)}</ul>
      </section>}

      {rows.length > 0 && <section aria-label="Mọi người">
        {top.length > 0 && <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">Mọi người</h2>}
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{rows.map(item => <FriendRow key={item.friend.userId} item={item} now={now} pins={pins} />)}</ul>
        {!showIdle && idle.length > idleShown && <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowIdle(true)}>Xem thêm {idle.length - idleShown} người</Button>}
      </section>}
    </div>

    {list.isPending && friends.length > 0 && <div role="status" aria-label="Đang tải mode" className="space-y-2"><div className="skeleton h-16" /><div className="skeleton h-16" /></div>}
    {friends.length > 0 && visible.length === 0 && !list.isPending && <p className="py-6 text-center text-sm text-[var(--muted)]">Không có ai trong mục này.</p>}

    {friends.length === 0 && <Card>
      <div className="py-6 text-center">
        <p className="text-[var(--muted)]">Kết bạn để thấy mode của nhau. Chỉ bạn bè đã kết nối mới thấy mode của bạn.</p>
        <Link to="/me/friends" className="pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--lime)] px-4 font-semibold text-[#1d230e]"><UserPlus size={17} /> Thêm bạn bè</Link>
      </div>
    </Card>}

    {friends.length > 0 && <p className="text-xs leading-5 text-[var(--muted)]">Xếp theo: người bạn ghim, cuộc hẹn sắp tới, tin chưa đọc, vị trí đang chia sẻ, mức trò chuyện, rồi mode. Mode do mỗi người tự chọn; ứng dụng không đoán từ GPS.</p>}
  </div>;
}
