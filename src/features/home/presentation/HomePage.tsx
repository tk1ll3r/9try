import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarClock, Check, MapPin, Plus, Users, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { appData } from "../../../shared/infrastructure/AppData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import type { CalendarOccurrence } from "../../calendars/infrastructure/CalendarData";
import { formatOccurrence } from "../domain/upcoming";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

interface Task { id: string; title: string; priority: "low" | "medium" | "high"; due_at: string | null }
interface HomeData {
  events: CalendarOccurrence[];
  tasks: Task[];
  groups: { group: { id: string; name: string }[] | { id: string; name: string } | null }[];
  notifications: { id: string }[];
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<HomeData>({ events: [], tasks: [], groups: [], notifications: [] });
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [undoTask, setUndoTask] = useState<{ id: string; completedAt: string } | null>(null);
  const mutationLock = useRef(false);
  const scope = useRef(new AsyncOwnerScope());

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try { const result = await appData.home(user.id) as HomeData; if (current()) { setData(result); setError(""); } }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : "Không thể tải dữ liệu"); }
    finally { if (current()) setLoading(false); }
  }
  useEffect(() => {
    scope.current.activate(user?.id); mutationLock.current = false;
    setData({ events: [], tasks: [], groups: [], notifications: [] }); setUndoTask(null);
    setPendingTask(null); setSaving(false); setError(""); setTitle("");
    void refresh(); return () => { scope.current.dispose(); };
  }, [user?.id]);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!user || !title.trim() || mutationLock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    mutationLock.current = true;
    setSaving(true);
    try {
      await appData.createTask(user.id, title, dueDate || undefined, priority);
      if (!current()) return;
      setTitle("");
      await refresh();
    } catch (err) { if (current()) setError(err instanceof Error ? err.message : "Không thêm được việc"); }
    finally { if (current()) { mutationLock.current = false; setSaving(false); } }
  }

  async function complete(id: string) {
    if (!user || mutationLock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    mutationLock.current = true;
    setPendingTask(id);
    try {
      const completedAt = await appData.setTaskCompleted(user.id, id, true);
      if (!current()) return;
      if (completedAt) setUndoTask({ id, completedAt }); await refresh();
    }
    catch (err) { if (current()) setError(err instanceof Error ? err.message : "Không hoàn tất được việc"); }
    finally { if (current()) { mutationLock.current = false; setPendingTask(null); } }
  }

  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{new Intl.DateTimeFormat("vi-VN",{ weekday:"long",day:"numeric",month:"long" }).format(new Date())}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">Hôm nay mình có gì?</h1></header>
    {error && <div role="alert" className="rounded-2xl bg-red-50 p-4 text-red-700">{error} <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>Thử lại</Button></div>}
    {undoTask && <div role="status" className="flex items-center justify-between rounded-2xl bg-[var(--soft)] p-3">Đã hoàn thành việc.
      <Button variant="ghost" disabled={!!pendingTask} onClick={async () => {
        if (!user || mutationLock.current) return;
        const current = scope.current.capture(user.id);
        if (!current()) return;
        mutationLock.current = true;
        setPendingTask(undoTask.id);
        try { await appData.undoTaskCompletion(user.id, undoTask.id, undoTask.completedAt); if (!current()) return; setUndoTask(null); await refresh(); }
        catch (err) { if (current()) setError(err instanceof Error ? err.message : "Không thể hoàn tác"); }
        finally { if (current()) { mutationLock.current = false; setPendingTask(null); } }
      }}>Hoàn tác</Button></div>}
    {loading && <p role="status">Đang tải hôm nay…</p>}
    <div aria-busy={loading} className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card title="Sắp tới" action={<Link className="text-sm font-semibold underline" to="/calendar">Mở lịch</Link>}>
        {data.events.length ? data.events.map((e) => <div key={e.id} className="mb-2 rounded-2xl bg-[var(--soft)] p-4"><b>{e.title}</b><p className="text-sm text-[var(--muted)]">{formatOccurrence(e)}</p></div>) :
          <div className="py-10 text-center text-[var(--muted)]"><CalendarClock className="mx-auto mb-2"/>{loading ? "Đang tải lịch…" : error ? "Chưa tải được lịch." : "Chưa có sự kiện trong 30 ngày tới"}</div>}
      </Card>
      <Card title={`Việc cần làm · ${data.tasks.length}`} action={<Link to="/me/organizer" className="text-sm font-semibold underline">Tất cả việc</Link>}>
        <form onSubmit={add} className="space-y-2">
          <label className="sr-only" htmlFor="quick-task">Nội dung công việc</label>
          <div className="flex gap-2"><input id="quick-task" className="field min-w-0 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Thêm việc hôm nay…" required maxLength={200}/>
            <Button type="submit" variant="secondary" disabled={saving || !!pendingTask} aria-label="Thêm việc"><Plus size={19}/></Button></div>
          <div className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="task-date">Ngày làm</label>
            <input id="task-date" className="field min-w-0 flex-1" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <label className="sr-only" htmlFor="task-priority">Độ ưu tiên</label>
            <select id="task-priority" className="field" value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])}>
              <option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option>
            </select>
          </div>
          <p className="text-xs text-[var(--muted)]">Xóa ngày để thêm việc không có hạn. Xem việc tương lai trong “Tất cả việc”.</p>
        </form>
        <div className="mt-4 space-y-1">{data.tasks.length ? data.tasks.map((t) => <button key={t.id} type="button" disabled={!!pendingTask || loading} aria-label={`Hoàn thành: ${t.title}`} onClick={() => void complete(t.id)} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--soft)]">
          <span className="grid size-6 shrink-0 place-items-center rounded-lg border-2 border-black/25 group-hover:border-emerald-600"><Check size={15} className="opacity-0 group-hover:opacity-100"/></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">{t.title}</span><span className="text-xs text-[var(--muted)]">{t.due_at ? new Date(t.due_at).toLocaleDateString("vi-VN") : "Không hạn"}{t.due_at && new Date(t.due_at) < new Date(new Date().setHours(0,0,0,0)) ? " · Quá hạn" : ""}</span></span>
          {t.priority === "high" && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900">Quan trọng</span>}
        </button>) : <p className="py-8 text-center text-sm text-[var(--muted)]">{loading ? "Đang tải việc…" : error ? "Chưa tải được công việc." : "Xong hết rồi! Thêm một việc mới ở trên."}</p>}</div>
      </Card>
    </div>
    <Card title="Lên kế hoạch cùng nhau">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/meetups" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><UsersRound size={19}/> Đề xuất cuộc hẹn</Link>
        <Link to="/me/friends" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Users size={19}/> Bạn bè và lời mời</Link>
        <Link to="/me/organizer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Check size={19}/> Việc, ghi chú và thói quen</Link>
        <Link to="/me/location" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><MapPin size={19}/> Chia sẻ vị trí có thời hạn</Link>
      </div>
    </Card>
    <Card title="Nhóm gần đây" action={<Link to="/groups" className="text-sm font-semibold underline">Tất cả nhóm</Link>}>{data.groups.length ? data.groups.map((m, index) => {
      const group = Array.isArray(m.group) ? m.group[0] : m.group;
      return group ? <Link key={group.id} to={`/groups/${group.id}`} className="mr-2 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--soft)] px-3 py-2 font-semibold hover:underline"><UsersRound size={16}/>{group.name}</Link> : <span key={index} />;
    }) : <p className="text-sm text-[var(--muted)]">{loading ? "Đang tải nhóm…" : error ? "Chưa tải được nhóm." : "Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung."}</p>}</Card>
  </div>;
}
