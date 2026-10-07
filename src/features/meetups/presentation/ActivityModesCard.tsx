import { Beer, BookOpen, CircleDot, Gamepad2, GraduationCap, Moon, Radio, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { useAcceptedFriends } from "../../../modules/friends";
import { activityModes, activityModesData, type ActiveMode, type ActivityMode } from "../infrastructure/ActivityModesData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

const choices = [
  { id: "studying", label: "Học bài", Icon: BookOpen, color: "text-blue-700 bg-blue-100" },
  { id: "school", label: "Đi học", Icon: GraduationCap, color: "text-violet-700 bg-violet-100" },
  { id: "gaming", label: "Chơi game", Icon: Gamepad2, color: "text-emerald-700 bg-emerald-100" },
  { id: "billiards", label: "Chơi Bi a", Icon: CircleDot, color: "text-teal-700 bg-teal-100" },
  { id: "drinks", label: "Nhậu", Icon: Beer, color: "text-orange-700 bg-orange-100" },
  { id: "sleeping", label: "Ngủ", Icon: Moon, color: "text-indigo-700 bg-indigo-100" },
] as const;

export function ActivityModesCard() {
  const { user } = useAuth();
  const [modes, setModes] = useState<ActiveMode[]>([]);
  const friends = useAcceptedFriends();
  const [minutes, setMinutes] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope = useRef(new AsyncOwnerScope());
  const mutationLock = useRef(false);

  useEffect(() => {
    scope.current.activate(user?.id);
    mutationLock.current = false;
    setModes([]); setError(""); setBusy(false);
    if (!user) return () => scope.current.dispose();
    const ownerId = user.id;
    async function refresh() {
      const current = scope.current.beginRequest(ownerId);
      if (!current()) return;
      try {
        const nextModes = await activityModesData.list();
        if (current()) { setModes(nextModes); setError(""); }
      } catch (err) {
        if (current()) setError(err instanceof Error ? err.message : "Không tải được mode.");
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => { scope.current.dispose(); window.clearInterval(interval); };
  }, [user?.id]);

  async function change(mode: ActivityMode | null) {
    if (!user || mutationLock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    mutationLock.current = true; setBusy(true);
    try {
      await activityModesData.set(mode, minutes);
      if (!current()) return;
      const nextModes = await activityModesData.list();
      if (current()) { setModes(nextModes); setError(""); }
    } catch (err) {
      if (current()) setError(err instanceof Error ? err.message : "Không lưu được mode.");
    } finally {
      if (current()) { mutationLock.current = false; setBusy(false); }
    }
  }

  const current = modes.find((item) => item.userId === user?.id && Date.parse(item.expiresAt) > Date.now());
  const byFriend = new Map(modes.filter((item) => item.userId !== user?.id && Date.parse(item.expiresAt) > Date.now()).map((item) => [item.userId, item]));

  return (
    <Card title="Bạn bè đang làm gì?" action={<Radio size={20} className="text-[var(--muted)]" />}>
      <p className="mb-4 text-sm text-[var(--muted)]">Tự chọn mode; chỉ bạn bè đã kết nối thấy. Mode tự tắt khi hết hạn, không dựa vào GPS.</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {choices.filter((choice) => activityModes.includes(choice.id)).map(({ id, label, Icon, color }) => (
          <button key={id} type="button" disabled={busy} aria-pressed={current?.mode === id}
            onClick={() => void change(current?.mode === id ? null : id)}
            className={`rounded-2xl border-2 p-3 text-left transition hover:-translate-y-0.5 disabled:opacity-50 ${current?.mode === id ? "border-[var(--ink)] bg-[var(--soft)]" : "border-transparent bg-[var(--soft)]"}`}>
            <span className={`mb-3 inline-flex size-10 items-center justify-center rounded-xl ${color}`}><Icon size={22} strokeWidth={2.1} /></span>
            <span className="block text-sm font-bold">{label}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <label className="font-semibold" htmlFor="mode-duration">Tự tắt sau</label>
        <select id="mode-duration" className="field" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
          <option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={120}>2 giờ</option>
          <option value={240}>4 giờ</option><option value={480}>8 giờ</option>
        </select>
        {current && <><span className="text-[var(--muted)]">Đến {new Date(current.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
          <Button variant="ghost" disabled={busy} onClick={() => void change(null)}><X size={16} /> Tắt mode</Button></>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      <h3 className="mt-6 mb-3 text-sm font-bold">Bạn bè</h3>
      {friends.length === 0 ? <p className="text-sm text-[var(--muted)]">Kết bạn để xem mode của nhau.</p> :
        <div className="flex flex-wrap gap-2">{friends.map((friend) => {
          const mode = byFriend.get(friend.userId);
          const choice = choices.find((item) => item.id === mode?.mode);
          return <div key={friend.userId} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
            {choice ? <span className={`flex size-8 items-center justify-center rounded-xl ${choice.color}`}><choice.Icon size={17} /></span> : <span className="size-2 rounded-full bg-gray-400" />}
            <span className="font-semibold">{friend.displayName}</span><span className="text-[var(--muted)]">{choice?.label ?? "Chưa chia sẻ"}</span>
          </div>;
        })}</div>}
    </Card>
  );
}
