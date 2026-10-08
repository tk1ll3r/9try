import { useState, type FormEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { matchesSearch } from "../../../kernel/text";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import type { Task, TaskDraft, TaskPriority, TaskSection } from "../domain/Task";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { useAllTasks, useTaskChange } from "./useTasks";

const sections: [TaskSection, string][] = [["overdue", "Quá hạn"], ["today", "Hôm nay"], ["upcoming", "Sắp tới"], ["undated", "Không hạn"]];

/** Every one-off task: search, filter by status and label, edit, complete with Undo, delete with confirmation. */
export function TaskListCard() {
  const list = useAllTasks();
  const { run, pending, error } = useTaskChange();
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft>({ title: "", dueDate: "", priority: "medium" });
  const [undo, setUndo] = useState<{ id: string; completedAt: string } | null>(null);
  const loading = list.isPending;
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được công việc.") : "");
  const all = list.data ?? [];
  const tags = [...new Set(all.flatMap(task => task.tags))].sort((a, b) => a.localeCompare(b, "vi"));
  const visible = all.filter(task => (filter === "all" || (filter === "done") === task.done)
    && (!tag || task.tags.includes(tag))
    && matchesSearch(`${task.title} ${task.tags.join(" ")}`, search));
  // Open tasks are grouped by when they are due; the other views are one list.
  const groups: [string, Task[]][] = filter === "open"
    ? sections.map(([id, label]): [string, Task[]] => [label, visible.filter(task => task.section() === id)]).filter(([, tasks]) => tasks.length)
    : visible.length ? [["", visible]] : [];

  function edit(task: Task) {
    setEditing(task);
    setDraft({ title: task.draftTitle, dueDate: task.dueDate, dueTime: task.dueTime, priority: task.priority });
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

  return <Card title="Tất cả công việc">
    <TaskQuickAdd placeholder="Thêm một việc…" />
    <p className="mb-3 mt-4 text-sm text-[var(--muted)]">Việc một lần, gồm cả tương lai. Việc lặp lại nằm ở màn hình Thói quen.</p>
    <div className="flex flex-wrap gap-2">
      <input className="field min-w-0 flex-1" aria-label="Tìm công việc" placeholder="Tìm công việc…" value={search} onChange={e => setSearch(e.target.value)} />
      <select className="field" aria-label="Lọc công việc" value={filter} onChange={e => setFilter(e.target.value)}><option value="open">Chưa xong</option><option value="done">Đã xong</option><option value="all">Tất cả</option></select>
    </div>
    {tags.length > 0 && <div role="group" aria-label="Lọc theo nhãn" className="mt-2 flex flex-wrap gap-2">
      {tags.map(name => <button key={name} type="button" aria-pressed={tag === name} onClick={() => setTag(tag === name ? "" : name)}
        className={`min-h-9 rounded-full px-3 text-sm font-semibold ${tag === name ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`}>#{name}</button>)}
    </div>}
    {problem && <div role="alert" className="mt-3 text-[var(--danger)]">{problem} <Button variant="ghost" disabled={pending || list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}
    {undo && <div role="status" className="mt-3 flex items-center justify-between gap-2">Đã hoàn thành việc.<Button variant="ghost" disabled={pending}
      onClick={() => run(service => service.undoCompletion(undo.id, undo.completedAt), () => setUndo(null))}>Hoàn tác</Button></div>}
    {editing && <form onSubmit={save} className="my-4 space-y-3 rounded-2xl bg-[var(--soft)] p-4">
      <label className="block text-sm">Tên việc<input autoFocus className="field mt-1 w-full" required maxLength={200} value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <div className="flex flex-wrap gap-3"><label className="text-sm">Ngày làm<input className="field mt-1 block" type="date" value={draft.dueDate} onChange={e => setDraft({ ...draft, dueDate: e.target.value })} /></label>
        <label className="text-sm">Giờ (tùy chọn)<input className="field mt-1 block" type="time" disabled={!draft.dueDate} value={draft.dueTime ?? ""} onChange={e => setDraft({ ...draft, dueTime: e.target.value })} /></label>
        <label className="text-sm">Ưu tiên<select className="field mt-1 block" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as TaskPriority })}><option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option></select></label></div>
      <p className="text-xs">Xóa ngày nếu việc không có hạn. Thêm nhãn bằng dấu #, ví dụ “#giảitích”.</p>
      <div className="flex gap-2"><Button type="submit" disabled={pending}>Lưu thay đổi</Button><Button variant="ghost" disabled={pending} onClick={() => setEditing(null)}>Hủy</Button></div>
    </form>}
    <DialogPanel open={!!deleting} onOpenChange={open => { if (!open) setDeleting(null); }} title="Xóa công việc?" description={`Xóa vĩnh viễn “${deleting?.title ?? ""}”. Thao tác này không thể hoàn tác.`} alert busy={pending}>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>Giữ lại</Button>
        <Button variant="danger" disabled={pending} onClick={() => { if (deleting) remove(deleting); }}>{pending ? "Đang xóa…" : "Xóa vĩnh viễn"}</Button></div>
    </DialogPanel>
    <div className="mt-4 space-y-4" aria-busy={loading}>
      {loading && <p role="status">Đang tải công việc…</p>}
      {groups.map(([label, tasks]) => <section key={label} aria-label={label || undefined} className="space-y-2">
        {label && <p className={`text-xs font-bold uppercase tracking-wider ${label === "Quá hạn" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{label} · {tasks.length}</p>}
        {tasks.map(task => <article key={task.id} className="rounded-2xl bg-[var(--soft)] p-3">
          <h3 className={`break-words font-semibold ${task.done ? "line-through" : ""}`}>{task.title}</h3>
          <p className="text-xs text-[var(--muted)]">{task.dueLabel}{task.isOverdue() ? " · Quá hạn" : ""}{task.priority === "high" ? " · Quan trọng" : ""}{task.tags.map(name => ` · #${name}`).join("")}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button variant="ghost" disabled={pending} onClick={() => run(
              async service => task.done ? (await service.reopen(task.id), null) : service.complete(task.id),
              completedAt => setUndo(completedAt ? { id: task.id, completedAt } : null),
            )}>{task.done ? "Mở lại" : "Hoàn thành"}</Button>
            <Button variant="ghost" disabled={pending} onClick={() => edit(task)}>Sửa</Button>
            <Button variant="ghost" disabled={pending} aria-label={`Xóa: ${task.title}`} onClick={() => setDeleting(task)}>Xóa</Button>
          </div>
        </article>)}
      </section>)}
      {!loading && !problem && visible.length === 0 && <p className="py-4 text-sm text-[var(--muted)]">Không có công việc phù hợp bộ lọc.</p>}
    </div>
  </Card>;
}
