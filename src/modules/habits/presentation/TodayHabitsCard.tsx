import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Card } from "../../../kernel/ui/Card";
import { streakCap, type Habit } from "../domain/Habit";
import { habitsModule } from "../habits.module";

export const habitsKey = ["habits"] as const;

function streakText(habit: Habit) {
  const cap = streakCap[habit.repeat];
  return `${Math.min(habit.streak, cap)}${habit.streak >= cap ? "+" : ""} ${habit.repeat === "weekly" ? "tuần" : "ngày"} liên tiếp`;
}

/** The check row of one habit. Tapping a habit that is done takes the completion back. */
export function HabitToggle({ habit, disabled, onToggle }: { habit: Habit; disabled: boolean; onToggle(): void }) {
  return <button type="button" aria-pressed={habit.done} disabled={disabled} onClick={onToggle} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl px-2 text-left disabled:opacity-60">
    {habit.done ? <CheckCircle2 size={24} className="shrink-0 text-emerald-600" /> : <Circle size={24} className="shrink-0 text-[var(--muted)]" />}
    <span className="min-w-0">
      <span className="block break-words font-semibold">{habit.title}</span>
      <span className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted)]">
        {habit.done ? habit.repeat === "weekly" ? "Đã xong tuần này" : "Đã xong hôm nay" : habit.repeat === "weekly" ? "Mỗi tuần" : "Mỗi ngày"}
        {habit.streak > 0 && <span className="inline-flex items-center gap-1 font-semibold text-[var(--ink)]"><Flame size={13} className="text-orange-500" />{streakText(habit)}</span>}
      </span>
    </span>
  </button>;
}

/** Today's card: the habits still to do in the running period first, then the ones already done. */
export function TodayHabitsCard() {
  const habits = useModule(habitsModule);
  const list = useQuery({ queryKey: habitsKey, queryFn: () => habits.list() });
  const { run, pending, error } = useAction(habitsKey);
  if (!list.data?.length) return null;
  const left = list.data.filter(habit => !habit.done);

  return <Card title={left.length ? `Thói quen · còn ${left.length}` : "Thói quen · xong hết"} action={<Link to="/habits" className="text-sm font-semibold underline">Tất cả</Link>}>
    <ul className="space-y-2">
      {[...left, ...list.data.filter(habit => habit.done)].map(habit => <li key={habit.id} className="rounded-2xl bg-[var(--soft)] p-2">
        <HabitToggle habit={habit} disabled={pending} onToggle={() => run(() => habit.done ? habits.undoDone(habit.id) : habits.markDone(habit.id))} />
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
