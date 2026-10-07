import { useQuery } from "@tanstack/react-query";
import { Beer, BookOpen, CircleDot, Gamepad2, GraduationCap, Moon, Radio, X } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends } from "../../friends";
import { activityModes } from "../domain/ActivityMode";
import { presenceModule } from "../presence.module";

const presenceKey = ["presence"] as const;

const choices = [
  { id: "studying", label: "Học bài", Icon: BookOpen, color: "text-blue-700 bg-blue-100" },
  { id: "school", label: "Đi học", Icon: GraduationCap, color: "text-violet-700 bg-violet-100" },
  { id: "gaming", label: "Chơi game", Icon: Gamepad2, color: "text-emerald-700 bg-emerald-100" },
  { id: "billiards", label: "Chơi Bi a", Icon: CircleDot, color: "text-teal-700 bg-teal-100" },
  { id: "drinks", label: "Nhậu", Icon: Beer, color: "text-orange-700 bg-orange-100" },
  { id: "sleeping", label: "Ngủ", Icon: Moon, color: "text-indigo-700 bg-indigo-100" },
] as const;

/** Pick what you are doing for a while, and see what your friends picked. */
export function ActivityModesCard() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const friends = useAcceptedFriends();
  // ponytail: a reload every minute; push the change over the realtime channel when a minute feels slow.
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list(), refetchInterval: 60_000 });
  const { run, pending, error } = useAction(presenceKey);
  const [minutes, setMinutes] = useState(120);

  const running = (list.data ?? []).filter(item => Date.parse(item.expiresAt) > Date.now());
  const mine = running.find(item => item.userId === userId);
  const byFriend = new Map(running.filter(item => item.userId !== userId).map(item => [item.userId, item]));
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được mode.") : "");

  return (
    <Card title="Bạn bè đang làm gì?" action={<Radio size={20} className="text-[var(--muted)]" />}>
      <p className="mb-4 text-sm text-[var(--muted)]">Tự chọn mode; chỉ bạn bè đã kết nối thấy. Mode tự tắt khi hết hạn, không dựa vào GPS.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {choices.filter(choice => activityModes.includes(choice.id)).map(({ id, label, Icon, color }) => (
          <button key={id} type="button" disabled={pending} aria-pressed={mine?.mode === id}
            onClick={() => run(() => presence.set(mine?.mode === id ? null : id, minutes))}
            className={`rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 disabled:opacity-50 ${mine?.mode === id ? "border-[var(--ink)] bg-[var(--soft)]" : "border-transparent bg-[var(--soft)]"}`}>
            <span className={`mb-3 inline-flex size-10 items-center justify-center rounded-xl ${color}`}><Icon size={22} strokeWidth={2.1} /></span>
            <span className="block text-sm font-bold">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="font-semibold" htmlFor="mode-duration">Tự tắt sau</label>
        <select id="mode-duration" className="field" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
          <option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={120}>2 giờ</option>
          <option value={240}>4 giờ</option><option value={480}>8 giờ</option>
        </select>
        {mine && <><span className="text-[var(--muted)]">Đến {new Date(mine.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => presence.set(null, minutes))}><X size={16} /> Tắt mode</Button></>}
      </div>
      {problem && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{problem}</p>}
      <h3 className="mt-6 mb-3 text-sm font-bold">Bạn bè</h3>
      {friends.length === 0 ? <p className="text-sm text-[var(--muted)]">Kết bạn để xem mode của nhau.</p> :
        <div className="flex flex-wrap gap-2">{friends.map(friend => {
          const choice = choices.find(item => item.id === byFriend.get(friend.userId)?.mode);
          return <div key={friend.userId} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
            {choice ? <span className={`flex size-8 items-center justify-center rounded-xl ${choice.color}`}><choice.Icon size={17} /></span> : <span className="size-2 rounded-full bg-gray-400" />}
            <span className="font-semibold">{friend.displayName}</span><span className="text-[var(--muted)]">{choice?.label ?? "Chưa chia sẻ"}</span>
          </div>;
        })}</div>}
    </Card>
  );
}
