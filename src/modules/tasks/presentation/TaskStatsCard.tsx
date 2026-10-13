import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { Card } from "../../../kernel/ui/Card";
import { BarChart, dayBars, StatTile } from "../../../kernel/ui/Stat";
import { taskStats } from "../domain/taskStats";
import { useAllTasks } from "./useTasks";
import { t } from "../../../kernel/i18n";

/** The statistics card of tasks: how many were finished in the days counted, day by day, and what is still open. */
export function TaskStatsCard({ days }: { days: number }) {
  const list = useAllTasks();
  const stats = taskStats(list.data ?? [], days);
  const perDay = new Map(stats.perDay.map(item => [item.day, item.done]));
  return <Card title={t("Việc")} action={<Link to="/me/organizer" className="card-link">{t("Mở việc")}</Link>}>
    {list.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(list.error, t("Chưa tải được công việc."))}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={stats.done} label={t("việc đã xong")} />
        <StatTile value={stats.open} label={t("việc còn lại")} />
        <StatTile value={stats.overdue} label={t("việc quá hạn")} />
      </div>
      <p className="mb-2 mt-4 text-xs font-bold text-[var(--muted)]">{t("Việc xong mỗi ngày")}</p>
      <BarChart label={t("Việc xong mỗi ngày")} bars={dayBars(stats.perDay.map(item => item.day),
        day => [{ value: perDay.get(day) ?? 0, color: "var(--lime-strong)" }], day => t("{0} việc xong", perDay.get(day) ?? 0))} />
    </>}
  </Card>;
}
