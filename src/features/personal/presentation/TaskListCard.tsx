import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { appData, type OneTimeTask } from "../../../shared/infrastructure/AppData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { localDateKey } from "../../home/domain/upcoming";
import { DialogPanel } from "../../../shared/ui/DialogPanel";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

export function TaskListCard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<OneTimeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<OneTimeTask | null>(null);
  const [deleting, setDeleting] = useState<OneTimeTask | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [priority, setPriority] = useState<OneTimeTask["priority"]>("medium");
  const [undo, setUndo] = useState<{ id: string; completedAt: string } | null>(null);
  const scope = useRef(new AsyncOwnerScope());

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try {
      const rows = await appData.listTasks(user.id);
      if (current()) { setTasks(rows); setError(""); }
    } catch (e) { if (current()) setError(e instanceof Error ? e.message : "Không tải được công việc."); }
    finally { if (current()) setLoading(false); }
  }
  useEffect(() => {
    scope.current.activate(user?.id); lock.current = false;
    setTasks([]); setUndo(null); setEditing(null); setDeleting(null); setPending(false); setError(""); setSearch(""); setTitle("");
    void refresh(); return () => { scope.current.dispose(); };
  }, [user?.id]);

  async function mutate(action: (current: () => boolean) => Promise<void>) {
    if (!user || lock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    lock.current = true; setPending(true); setError("");
    try { await action(current); if (current()) await refresh(); }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : "Thao tác chưa thành công. Hãy thử lại."); }
    finally { if (current()) { lock.current = false; setPending(false); } }
  }
  function edit(task: OneTimeTask) {
    setEditing(task); setTitle(task.title);
    setDate(task.due_at ? localDateKey(new Date(task.due_at)) : ""); setPriority(task.priority);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || !editing) return;
    await mutate(async current => {
      await appData.updateTask(user.id, editing.id, title, date, priority, editing.due_at);
      if (current()) setEditing(null);
    });
  }
  const visible = tasks.filter(task => (filter === "all" || (filter === "done" ? !!task.completed_at : !task.completed_at))
    && task.title.toLocaleLowerCase("vi-VN").includes(search.toLocaleLowerCase("vi-VN")));

  return <Card title="Tất cả công việc" action={<Link to="/" className="text-sm font-semibold underline">Thêm ở Hôm nay</Link>}>
    <p className="mb-3 text-sm text-[var(--muted)]">Việc một lần, gồm cả tương lai. Thói quen nằm ở mục riêng bên dưới.</p>
    <div className="flex flex-wrap gap-2">
      <input className="field min-w-0 flex-1" aria-label="Tìm công việc" placeholder="Tìm công việc…" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="field" aria-label="Lọc công việc" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Chưa xong</option><option value="done">Đã xong</option><option value="all">Tất cả</option></select>
    </div>
    {error && <div role="alert" className="mt-3 text-red-700">{error} <Button variant="ghost" disabled={pending || loading} onClick={() => void refresh()}>Thử tải lại</Button></div>}
    {undo && <div role="status" className="mt-3 flex items-center justify-between gap-2">Đã hoàn thành việc.<Button variant="ghost" disabled={pending} onClick={() => void mutate(async current => {
      if (!user) return;
      await appData.undoTaskCompletion(user.id, undo.id, undo.completedAt); if (current()) setUndo(null);
    })}>Hoàn tác</Button></div>}
    {editing && <form onSubmit={save} className="my-4 space-y-3 rounded-2xl bg-[var(--soft)] p-4">
      <label className="block text-sm">Tên việc<input autoFocus className="field mt-1 w-full" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Ngày làm<input className="field mt-1 block" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="text-sm">Ưu tiên<select className="field mt-1 block" value={priority} onChange={e => setPriority(e.target.value as OneTimeTask["priority"])}><option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option></select></label></div>
      <p className="text-xs">Xóa ngày nếu việc không có hạn.</p>
      <div className="flex gap-2"><Button type="submit" disabled={pending}>Lưu thay đổi</Button><Button variant="ghost" disabled={pending} onClick={() => setEditing(null)}>Hủy</Button></div>
    </form>}
    <DialogPanel open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }} title="Xóa công việc?" description={`Xóa vĩnh viễn “${deleting?.title ?? ""}”. Thao tác này không thể hoàn tác.`} alert busy={pending}>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>Giữ lại</Button>
        <Button variant="danger" disabled={pending} onClick={() => void mutate(async current => {
          if (!user || !deleting) return;
          await appData.deleteTask(user.id, deleting.id);
          if (!current()) return;
          if (editing?.id === deleting.id) setEditing(null);
          if (undo?.id === deleting.id) setUndo(null);
          setDeleting(null);
        })}>{pending ? "Đang xóa…" : "Xóa vĩnh viễn"}</Button></div>
    </DialogPanel>
    <div className="mt-4 space-y-2" aria-busy={loading}>
      {loading ? <p role="status">Đang tải công việc…</p> : visible.map(task => <article key={task.id} className="rounded-2xl bg-[var(--soft)] p-3">
        <h3 className={`break-words font-semibold ${task.completed_at ? "line-through" : ""}`}>{task.title}</h3>
        <p className="text-xs text-[var(--muted)]">{task.due_at ? new Date(task.due_at).toLocaleDateString("vi-VN") : "Không hạn"}{!task.completed_at && task.due_at && localDateKey(new Date(task.due_at)) < localDateKey(new Date()) ? " · Quá hạn" : ""}{task.priority === "high" ? " · Quan trọng" : ""}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" disabled={pending} onClick={() => void mutate(async current => {
            if (!user) return;
            const completedAt = await appData.setTaskCompleted(user.id, task.id, !task.completed_at);
            if (current()) setUndo(completedAt ? { id: task.id, completedAt } : null);
          })}>{task.completed_at ? "Mở lại" : "Hoàn thành"}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => edit(task)}>Sửa</Button>
          <Button variant="ghost" disabled={pending} aria-label={`Xóa: ${task.title}`} onClick={() => setDeleting(task)}>Xóa</Button>
        </div>
      </article>)}
      {!loading && !error && visible.length === 0 && <p className="py-4 text-sm text-[var(--muted)]">Không có công việc phù hợp bộ lọc.</p>}
    </div>
  </Card>;
}
