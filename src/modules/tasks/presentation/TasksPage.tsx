import { ReminderCard } from "../../notifications";
import { TaskListCard } from "./TaskListCard";

export function TasksPage() {
  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư, chỉ mình bạn</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Việc cần làm</h1>
    </header>
    <TaskListCard />
    <ReminderCard />
  </div>;
}
