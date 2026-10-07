import { Check, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import type { TaskPriority } from "../domain/Task";
import { useTaskChange, useTodayTasks } from "./useTasks";

/** Today's card: quick add, plus the open tasks that are overdue, due today or undated. */
export function TodayTasksCard() {
  const today = useTodayTasks();
  const { run, pending, error } = useTaskChange();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => localDateKey(new Date()));
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [undo, setUndo] = useState<{ id: string; completedAt: string } | null>(null);
  const tasks = today.data ?? [];
  const problem = error || (today.isError ? errorMessage(today.error, "Chưa tải được công việc.") : "");

  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    run(service => service.add({ title, dueDate, priority }), () => setTitle(""));
  }

  return <Card title={`Việc cần làm · ${tasks.length}`} action={<Link to="/me/organizer" className="text-sm font-semibold underline">Tất cả việc</Link>}>
    <form onSubmit={add} className="space-y-2">
      <label className="sr-only" htmlFor="quick-task">Nội dung công việc</label>
      <div className="flex gap-2"><input id="quick-task" className="field min-w-0 flex-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="Thêm việc hôm nay…" required maxLength={200} />
        <Button type="submit" variant="secondary" disabled={pending} aria-label="Thêm việc"><Plus size={19} /></Button></div>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="task-date">Ngày làm</label>
        <input id="task-date" className="field min-w-0 flex-1" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        <label className="sr-only" htmlFor="task-priority">Độ ưu tiên</label>
        <select id="task-priority" className="field" value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
          <option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option>
        </select>
      </div>
      <p className="text-xs text-[var(--muted)]">Xóa ngày để thêm việc không có hạn. Xem việc tương lai trong “Tất cả việc”.</p>
    </form>
    {problem && <div role="alert" className="mt-3 text-sm text-red-700">{problem} <Button variant="ghost" disabled={pending || today.isFetching} onClick={() => void today.refetch()}>Thử lại</Button></div>}
    {undo && <div role="status" className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--soft)] p-3">Đã hoàn thành việc.
      <Button variant="ghost" disabled={pending} onClick={() => run(service => service.undoCompletion(undo.id, undo.completedAt), () => setUndo(null))}>Hoàn tác</Button></div>}
    <div className="mt-4 space-y-1">{tasks.length ? tasks.map(task => <button key={task.id} type="button" disabled={pending} aria-label={`Hoàn thành: ${task.title}`}
      onClick={() => run(service => service.complete(task.id), completedAt => setUndo({ id: task.id, completedAt }))} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--soft)]">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg border-2 border-black/25 group-hover:border-emerald-600"><Check size={15} className="opacity-0 group-hover:opacity-100" /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{task.title}</span><span className="text-xs text-[var(--muted)]">{task.dueAt ? new Date(task.dueAt).toLocaleDateString("vi-VN") : "Không hạn"}{task.isOverdue() ? " · Quá hạn" : ""}</span></span>
      {task.priority === "high" && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900">Quan trọng</span>}
    </button>) : !today.isError && <p className="py-8 text-center text-sm text-[var(--muted)]">{today.isPending ? "Đang tải việc…" : "Xong hết rồi! Thêm một việc mới ở trên."}</p>}</div>
  </Card>;
}
