import { useQuery } from "@tanstack/react-query";
import { Radio, UserPlus, X } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends } from "../../friends";
import { activityModes, remainingShare } from "../domain/ActivityMode";
import { presenceModule } from "../presence.module";
import { MemberAvatar } from "./MemberAvatar";
import { choiceOf, choices, presenceKey, untilTime } from "./modes";

const durations = [[30, "30 phút"], [60, "1 giờ"], [120, "2 giờ"], [240, "4 giờ"], [480, "8 giờ"]] as const;
const ringLength = 2 * Math.PI * 54;

/** The app's main screen: what every friend says they are doing right now, and the user's own mode. */
export function ModePage() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const friends = useAcceptedFriends();
  // The realtime "presence" event reloads this at once; the timer covers a missed event.
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list(), refetchInterval: 20_000 });
  const { run, pending, error } = useAction(presenceKey);
  const [minutes, setMinutes] = useState(120);
  const [now, setNow] = useState(Date.now());

  // Modes end by the clock, so the screen looks at the clock twice a minute.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const running = (list.data ?? []).filter(item => Date.parse(item.expiresAt) > now);
  const mine = running.find(item => item.userId === userId);
  const myChoice = choiceOf(mine?.mode);
  const members = friends.map(friend => ({ friend, mode: running.find(item => item.userId === friend.userId) }));
  const groups = choices.map(choice => ({ choice, members: members.filter(member => member.mode?.mode === choice.id) })).filter(group => group.members.length);
  const idle = members.filter(member => !member.mode);
  const active = members.length - idle.length;
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được mode.") : "");

  return <div className="space-y-5">
    <header>
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><Radio size={16} className="text-[var(--lime-strong)]" /> {friends.length ? `${active}/${friends.length} bạn đang bật mode` : "Tự chọn, tự tắt, chỉ bạn bè thấy"}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">Mọi người đang làm gì?</h1>
    </header>

    {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}

    <section aria-label="Mode của bạn" style={myChoice ? { "--mode": myChoice.color } as CSSProperties : undefined}
      className={`relative overflow-hidden rounded-[32px] border border-black/8 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-5 backdrop-blur-md transition-shadow duration-500 sm:p-7 dark:border-white/8 ${myChoice ? "mode-glow" : ""}`}>
      {myChoice && <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full opacity-25 blur-3xl" style={{ background: myChoice.color }} />}
      <div className="relative flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative grid shrink-0 place-items-center">
          {/* The ring empties as the mode's time runs out. */}
          {mine && myChoice && <svg key={mine.mode} viewBox="0 0 120 120" aria-hidden className="animate-pop absolute size-36 -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--soft)" strokeWidth="5" />
            <circle cx="60" cy="60" r="54" fill="none" stroke={myChoice.color} strokeWidth="5" strokeLinecap="round" strokeDasharray={ringLength}
              strokeDashoffset={ringLength * (1 - remainingShare(mine, now))} style={{ transition: "stroke-dashoffset 1s var(--ease-out)" }} />
          </svg>}
          <span className="grid size-36 place-items-center">
            {myChoice ? <span key={myChoice.id} className="animate-pop grid size-24 place-items-center rounded-full text-white shadow-xl" style={{ background: `linear-gradient(135deg, ${myChoice.color}, color-mix(in srgb, ${myChoice.color} 60%, #000))` }}><myChoice.Icon size={44} strokeWidth={2} /></span>
              : <span className="grid size-24 place-items-center rounded-full border-2 border-dashed border-[var(--border)] text-3xl font-black text-[var(--muted)]">?</span>}
          </span>
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-semibold text-[var(--muted)]">Mode của bạn</p>
          <p role="status" className="mt-1 text-3xl font-black tracking-tight">{myChoice ? myChoice.label : "Chưa bật mode"}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">{mine ? `Bạn bè thấy mode này tới ${untilTime(mine.expiresAt)}.` : "Chọn một mode bên dưới để bạn bè biết bạn đang làm gì."}</p>
          {mine && <Button className="mt-3" variant="ghost" disabled={pending} onClick={() => run(() => presence.set(null, minutes))}><X size={16} /> Tắt mode</Button>}
        </div>
      </div>

      <div className="relative mt-6 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {choices.filter(choice => activityModes.includes(choice.id)).map(choice => {
          const on = mine?.mode === choice.id;
          return <button key={choice.id} type="button" disabled={pending} aria-pressed={on} style={{ "--mode": choice.color } as CSSProperties}
            onClick={() => run(() => presence.set(on ? null : choice.id, minutes))}
            className={`pressable flex min-h-24 flex-col items-center justify-center gap-2 rounded-3xl border-2 p-2 text-sm font-bold disabled:opacity-60 ${on ? "mode-glow border-[var(--mode)] bg-[color-mix(in_srgb,var(--mode)_14%,var(--surface))]" : "border-transparent bg-[var(--soft)]"}`}>
            <span className={`grid size-11 place-items-center rounded-2xl text-white transition-transform duration-300 ease-[var(--ease-spring)] ${on ? "scale-110" : ""}`} style={{ background: choice.color }}><choice.Icon size={22} strokeWidth={2.2} /></span>
            {choice.label}
          </button>;
        })}
      </div>

      <div role="group" aria-label="Tự tắt sau" className="relative mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-[var(--muted)]">Tự tắt sau</span>
        {durations.map(([value, label]) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => setMinutes(value)}
          className={`min-h-9 rounded-full px-3 font-semibold transition-colors duration-200 ${minutes === value ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>{label}</button>)}
      </div>
    </section>

    {groups.length > 0 && <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">{groups.map(({ choice, members: people }) => <Card key={choice.id} title={`${choice.label} · ${people.length}`}
      action={<span className="grid size-9 place-items-center rounded-xl text-white" style={{ background: choice.color }}><choice.Icon size={18} /></span>}>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {people.map(({ friend, mode }) => <li key={friend.userId}>
          <Link to={`/chat/with/${friend.userId}`} aria-label={`${friend.displayName}: ${choice.label}. Nhắn tin`} className="pressable flex flex-col items-center gap-2 rounded-3xl bg-[var(--soft)] p-4 text-center">
            <MemberAvatar name={friend.displayName} choice={choice} />
            <b className="max-w-full truncate">{friend.displayName}</b>
            <span className="text-xs text-[var(--muted)]">tới {untilTime(mode!.expiresAt)}</span>
          </Link>
        </li>)}
      </ul>
    </Card>)}</div>}

    {idle.length > 0 && <Card title={`Chưa bật mode · ${idle.length}`}>
      <ul className="flex flex-wrap gap-2">
        {idle.map(({ friend }) => <li key={friend.userId} className="flex items-center gap-2 rounded-full bg-[var(--soft)] py-1.5 pl-1.5 pr-4 text-sm">
          <span className="grid size-8 place-items-center rounded-full bg-[var(--surface)] font-bold text-[var(--muted)]">{friend.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="font-semibold">{friend.displayName}</span>
        </li>)}
      </ul>
    </Card>}

    {friends.length === 0 && <Card>
      <div className="py-6 text-center">
        <p className="text-[var(--muted)]">Kết bạn để thấy mode của nhau. Chỉ bạn bè đã kết nối mới thấy mode của bạn.</p>
        <Link to="/me/friends" className="pressable mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--lime)] px-4 font-semibold text-[#1d230e]"><UserPlus size={17} /> Thêm bạn bè</Link>
      </div>
    </Card>}

    <p className="text-xs leading-5 text-[var(--muted)]">Mode do bạn tự chọn và tự tắt khi hết giờ. Ứng dụng không đoán mode từ GPS hay lịch của bạn.</p>
  </div>;
}
