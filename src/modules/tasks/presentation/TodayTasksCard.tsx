import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { useTaskChange, useTodayTasks } from "./useTasks";
import { t } from "../../../kernel/i18n";

/** Today's card: quick add, plus the open tasks that are overdue, due today or undated. */
export function TodayTasksCard() {
  const today = useTodayTasks();
  const { run, pending, error } = useTaskChange();
  const [undo, setUndo] = useState<{ id: string; completedAt: string } | null>(null);
  const tasks = today.data ?? [];
  const problem = error || (today.isError ? errorMessage(today.error, t("Chưa tải được công việc.")) : "");

  return <Card title={t("Việc cần làm · {0}", tasks.length)} action={<Link to="/me/organizer" className="card-link">{t("Tất cả việc")}</Link>}>
    <TaskQuickAdd placeholder={t("Thêm việc hôm nay…")} />
    {problem && <div role="alert" className="mt-3 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={pending || today.isFetching} onClick={() => void today.refetch()}>{t("Thử lại")}</Button></div>}
    {undo && <div role="status" className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--soft)] p-3">{t("Đã hoàn thành việc.")}
      <Button variant="ghost" disabled={pending} onClick={() => run(service => service.undoCompletion(undo.id, undo.completedAt), () => setUndo(null))}>{t("Hoàn tác")}</Button></div>}
    <div className="mt-4 space-y-1">{tasks.length ? tasks.map(task => <button key={task.id} type="button" disabled={pending} aria-label={t("Hoàn thành: {0}", task.title)}
      onClick={() => run(service => service.complete(task.id), completedAt => setUndo({ id: task.id, completedAt }))} className="group flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-[var(--soft)]">
      <span className="grid size-6 shrink-0 place-items-center rounded-lg border-2 border-[var(--border)] group-hover:border-emerald-600"><Check size={15} className="opacity-0 group-hover:opacity-100" /></span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{task.title}</span><span className="text-xs text-[var(--muted)]">{task.dueLabel}{task.isOverdue() ? t(" · Quá hạn") : ""}{task.tags.map(name => ` · #${name}`).join("")}</span></span>
      {task.priority === "high" && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-900">{t("Quan trọng")}</span>}
    </button>) : !today.isError && <p className="py-8 text-center text-sm text-[var(--muted)]">{today.isPending ? t("Đang tải việc…") : t("Xong hết rồi! Thêm một việc mới ở trên.")}</p>}</div>
  </Card>;
}
