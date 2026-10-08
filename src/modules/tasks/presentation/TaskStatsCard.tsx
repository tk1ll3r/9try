import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { Card } from "../../../kernel/ui/Card";
import { BarChart, dayBars, StatTile } from "../../../kernel/ui/Stat";
import { taskStats } from "../domain/taskStats";
import { useAllTasks } from "./useTasks";

/** The statistics card of tasks: how many were finished in the days counted, day by day, and what is still open. */
export function TaskStatsCard({ days }: { days: number }) {
  const list = useAllTasks();
  const stats = taskStats(list.data ?? [], days);
  const perDay = new Map(stats.perDay.map(item => [item.day, item.done]));
  return <Card title="Việc" action={<Link to="/me/organizer" className="text-sm font-semibold underline">Mở việc</Link>}>
    {list.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(list.error, "Chưa tải được công việc.")}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={stats.done} label="việc đã xong" />
        <StatTile value={stats.open} label="việc còn lại" />
        <StatTile value={stats.overdue} label="việc quá hạn" />
      </div>
      <p className="mb-2 mt-4 text-xs font-bold text-[var(--muted)]">Việc xong mỗi ngày</p>
      <BarChart label="Việc xong mỗi ngày" bars={dayBars(stats.perDay.map(item => item.day),
        day => [{ value: perDay.get(day) ?? 0, color: "var(--lime-strong)" }], day => `${perDay.get(day) ?? 0} việc xong`)} />
    </>}
  </Card>;
}
