import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { matchesSearch } from "../../../kernel/text";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { DialogPanel } from "../../../shared/ui/DialogPanel";
import type { Task, TaskDraft, TaskPriority } from "../domain/Task";
import { useAllTasks, useTaskChange } from "./useTasks";

/** Every one-off task: search, filter, edit, complete with Undo, delete with confirmation. */
export function TaskListCard() {
  const list = useAllTasks();
  const { run, pending, error } = useTaskChange();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft>({ title: "", dueDate: "", priority: "medium" });
  const [undo, setUndo] = useState<{ id: string; completedAt: string } | null>(null);
  const loading = list.isPending;
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được công việc.") : "");
  const visible = (list.data ?? []).filter(task => (filter === "all" || (filter === "done") === task.done)
    && matchesSearch(task.title, search));

  function edit(task: Task) {
    setEditing(task);
    setDraft({ title: task.title, dueDate: task.dueDate, priority: task.priority });
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (editing) run(service => service.edit(editing, draft), () => setEditing(null));
  }
  function remove(task: Task) {
    run(service => service.remove(task.id), () => {
      if (editing?.id === task.id) setEditing(null);
      if (undo?.id === task.id) setUndo(null);
      setDeleting(null);
    });
  }

  return <Card title="Tất cả công việc" action={<Link to="/" className="text-sm font-semibold underline">Thêm ở Hôm nay</Link>}>
    <p className="mb-3 text-sm text-[var(--muted)]">Việc một lần, gồm cả tương lai. Việc lặp lại nằm ở màn hình Thói quen.</p>
    <div className="flex flex-wrap gap-2">
      <input className="field min-w-0 flex-1" aria-label="Tìm công việc" placeholder="Tìm công việc…" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="field" aria-label="Lọc công việc" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Chưa xong</option><option value="done">Đã xong</option><option value="all">Tất cả</option></select>
    </div>
    {problem && <div role="alert" className="mt-3 text-[var(--danger)]">{problem} <Button variant="ghost" disabled={pending || list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}
    {undo && <div role="status" className="mt-3 flex items-center justify-between gap-2">Đã hoàn thành việc.<Button variant="ghost" disabled={pending}
      onClick={() => run(service => service.undoCompletion(undo.id, undo.completedAt), () => setUndo(null))}>Hoàn tác</Button></div>}
    {editing && <form onSubmit={save} className="my-4 space-y-3 rounded-2xl bg-[var(--soft)] p-4">
      <label className="block text-sm">Tên việc<input autoFocus className="field mt-1 w-full" required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Ngày làm<input className="field mt-1 block" type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></label>
        <label className="text-sm">Ưu tiên<select className="field mt-1 block" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as TaskPriority })}><option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option></select></label></div>
      <p className="text-xs">Xóa ngày nếu việc không có hạn.</p>
      <div className="flex gap-2"><Button type="submit" disabled={pending}>Lưu thay đổi</Button><Button variant="ghost" disabled={pending} onClick={() => setEditing(null)}>Hủy</Button></div>
    </form>}
    <DialogPanel open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }} title="Xóa công việc?" description={`Xóa vĩnh viễn “${deleting?.title ?? ""}”. Thao tác này không thể hoàn tác.`} alert busy={pending}>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>Giữ lại</Button>
        <Button variant="danger" disabled={pending} onClick={() => { if (deleting) remove(deleting); }}>{pending ? "Đang xóa…" : "Xóa vĩnh viễn"}</Button></div>
    </DialogPanel>
    <div className="mt-4 space-y-2" aria-busy={loading}>
      {loading ? <p role="status">Đang tải công việc…</p> : visible.map(task => <article key={task.id} className="rounded-2xl bg-[var(--soft)] p-3">
        <h3 className={`break-words font-semibold ${task.done ? "line-through" : ""}`}>{task.title}</h3>
        <p className="text-xs text-[var(--muted)]">{task.dueAt ? new Date(task.dueAt).toLocaleDateString("vi-VN") : "Không hạn"}{task.isOverdue() ? " · Quá hạn" : ""}{task.priority === "high" ? " · Quan trọng" : ""}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="ghost" disabled={pending} onClick={() => run(
            async service => task.done ? (await service.reopen(task.id), null) : service.complete(task.id),
            completedAt => setUndo(completedAt ? { id: task.id, completedAt } : null),
          )}>{task.done ? "Mở lại" : "Hoàn thành"}</Button>
          <Button variant="ghost" disabled={pending} onClick={() => edit(task)}>Sửa</Button>
          <Button variant="ghost" disabled={pending} aria-label={`Xóa: ${task.title}`} onClick={() => setDeleting(task)}>Xóa</Button>
        </div>
      </article>)}
      {!loading && !problem && visible.length === 0 && <p className="py-4 text-sm text-[var(--muted)]">Không có công việc phù hợp bộ lọc.</p>}
    </div>
  </Card>;
}
