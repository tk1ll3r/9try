import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { StatTile } from "../../../kernel/ui/Stat";
import { streakCap } from "../domain/Habit";
import { habitsModule } from "../habits.module";
import { habitsKey } from "./TodayHabitsCard";
import { t } from "../../../kernel/i18n";

/** The statistics card of habits: how well each one was kept in the days counted, and its streak. */
export function HabitStatsCard({ days }: { days: number }) {
  const habits = useModule(habitsModule);
  const list = useQuery({ queryKey: habitsKey, queryFn: () => habits.list() });
  const all = list.data ?? [];
  const kept = all.map(habit => habit.kept(days));
  const done = kept.reduce((sum, item) => sum + item.done, 0), of = kept.reduce((sum, item) => sum + item.of, 0);
  return <Card title={t("Thói quen")} action={<Link to="/habits" className="text-sm font-semibold underline">{t("Mở thói quen")}</Link>}>
    {list.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(list.error, t("Không tải được thói quen."))}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={all.length} label={t("thói quen")} />
        <StatTile value={of ? `${Math.round(done / of * 100)}%` : "–"} label={t("lần giữ được")} />
        <StatTile value={Math.max(0, ...all.map(habit => habit.streak))} label={t("chuỗi dài nhất")} />
      </div>
      {list.isSuccess && !all.length && <p className="mt-4 text-sm text-[var(--muted)]">{t("Chưa có thói quen nào để đếm.")}</p>}
      <ul className="mt-4 space-y-3">
        {all.map((habit, index) => <li key={habit.id}>
          <p className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold">{habit.title}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-[var(--muted)]">
              {habit.streak > 0 && <span className="inline-flex items-center gap-0.5 font-semibold text-[var(--ink)]"><Flame size={12} className="text-orange-500" />{Math.min(habit.streak, streakCap[habit.repeat])}</span>}
              {kept[index].done}/{kept[index].of} {habit.repeat === "weekly" ? t("tuần") : t("ngày")}
            </span>
          </p>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--soft)]"><i className="block h-full rounded-full bg-[var(--lime-strong)]" style={{ width: `${kept[index].done / kept[index].of * 100}%` }} /></div>
        </li>)}
      </ul>
    </>}
  </Card>;
}
