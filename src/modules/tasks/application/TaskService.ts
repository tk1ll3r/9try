import { SystemClock, type Clock } from "../../../shared/domain/Clock";
import { Task, type TaskDraft } from "../domain/Task";
import type { TaskRepository } from "../domain/TaskRepository";

/** Everything a person can do with their one-off tasks. */
export class TaskService {
  constructor(private readonly tasks: TaskRepository, private readonly clock: Clock = new SystemClock()) {}

  list() {
    return this.tasks.list();
  }

  /** For Today: open tasks that are overdue, due today or have no due date. */
  dueToday() {
    const tomorrow = this.clock.now();
    tomorrow.setHours(24, 0, 0, 0);
    return this.tasks.listOpenDueBefore(tomorrow);
  }

  async add(draft: TaskDraft) {
    await this.tasks.add(Task.details(draft));
  }

  async edit(task: Task, draft: TaskDraft) {
    await this.tasks.update(task.id, Task.details(draft, task));
  }

  /** Returns the completion time, which `undoCompletion` needs. */
  async complete(id: string) {
    const completedAt = this.clock.now().toISOString();
    await this.tasks.setCompletedAt(id, completedAt);
    return completedAt;
  }

  reopen(id: string) {
    return this.tasks.setCompletedAt(id, null);
  }

  undoCompletion(id: string, completedAt: string) {
    return this.tasks.undoCompletion(id, completedAt);
  }

  remove(id: string) {
    return this.tasks.remove(id);
  }
}
