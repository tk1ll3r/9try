import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Flame, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { streakCap, type Habit, type HabitRepeat } from "../domain/Habit";
import { habitsModule } from "../habits.module";

const habitsKey = ["habits"] as const;

function streakText(habit: Habit) {
  const cap = streakCap[habit.repeat];
  return `${Math.min(habit.streak, cap)}${habit.streak >= cap ? "+" : ""} ${habit.repeat === "weekly" ? "tuần" : "ngày"} liên tiếp`;
}

export function HabitsPage() {
  const habits = useModule(habitsModule);
  const list = useQuery({ queryKey: habitsKey, queryFn: () => habits.list() });
  const { run, pending, error } = useAction(habitsKey);
  const [title, setTitle] = useState("");
  const [repeat, setRepeat] = useState<HabitRepeat>("daily");
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được thói quen.") : "");

  function add(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) run(() => habits.create(title, repeat), () => setTitle(""));
  }

  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư, chỉ mình bạn</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Thói quen</h1>
    </header>

    {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}

    <Card title="Việc lặp lại của bạn">
      {list.isPending && <p role="status">Đang tải thói quen…</p>}
      {list.isSuccess && !list.data.length && <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có thói quen nào. Thêm một việc bạn muốn làm đều ở bên dưới.</p>}
      <ul className="space-y-2">
        {list.data?.map(habit => <li key={habit.id} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] p-2">
          <button type="button" aria-pressed={habit.done} disabled={pending} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left disabled:opacity-60"
            onClick={() => run(() => habit.done ? habits.undoDone(habit.id) : habits.markDone(habit.id))}>
            {habit.done ? <CheckCircle2 size={24} className="shrink-0 text-emerald-600" /> : <Circle size={24} className="shrink-0 text-[var(--muted)]" />}
            <span className="min-w-0">
              <span className="block truncate font-semibold">{habit.title}</span>
              <span className="block text-xs text-[var(--muted)]">{habit.done ? habit.repeat === "weekly" ? "Đã xong tuần này · chạm để bỏ đánh dấu" : "Đã xong hôm nay · chạm để bỏ đánh dấu" : habit.repeat === "weekly" ? "Mỗi tuần" : "Mỗi ngày"}</span>
            </span>
          </button>
          {habit.streak > 0 && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold"><Flame size={15} className="text-orange-500" />{streakText(habit)}</span>}
          <button type="button" disabled={pending} aria-label={`Xóa thói quen ${habit.title}`} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10"
            onClick={() => { if (window.confirm(`Xóa thói quen “${habit.title}” cùng lịch sử của nó?`)) run(() => habits.remove(habit.id)); }}><Trash2 size={16} /></button>
        </li>)}
      </ul>
    </Card>

    <Card title="Thêm thói quen">
      <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row">
        <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Tên thói quen<input className="field min-w-0" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Đọc 20 phút" maxLength={200} required /></label>
        <label className="grid gap-1 text-sm font-semibold">Tần suất<select className="field" value={repeat} onChange={event => setRepeat(event.target.value as HabitRepeat)}>
          <option value="daily">Mỗi ngày</option>
          <option value="weekly">Mỗi tuần</option>
        </select></label>
        <Button type="submit" variant="secondary" disabled={pending} className="self-end"><Plus size={17} /> Thêm</Button>
      </form>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Mỗi tuần: làm một lần từ thứ Hai đến Chủ nhật. Ngày được tính theo múi giờ trong hồ sơ của bạn.</p>
    </Card>
  </div>;
}
