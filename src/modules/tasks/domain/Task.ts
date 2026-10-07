import { localDateKey } from "../../../kernel/dates";
import { DomainError } from "../../../shared/domain/DomainError";

export type TaskPriority = "low" | "medium" | "high";

/** What a person types when adding or editing. `dueDate` is "YYYY-MM-DD" on their device, or "". */
export interface TaskDraft {
  title: string;
  dueDate: string;
  priority: TaskPriority;
}

/** A checked draft, ready to store. */
export interface TaskDetails {
  title: string;
  priority: TaskPriority;
  dueAt: string | null;
}

/** A one-off personal task. Routines share the database table but are a separate concept. */
export class Task {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly priority: TaskPriority,
    readonly dueAt: string | null,
    readonly completedAt: string | null,
  ) {}

  get done(): boolean {
    return this.completedAt !== null;
  }

  /** The due day on this device as "YYYY-MM-DD", or "" when the task has no due date. */
  get dueDate(): string {
    return this.dueAt ? localDateKey(new Date(this.dueAt)) : "";
  }

  isOverdue(now = new Date()): boolean {
    return !this.done && this.dueDate !== "" && this.dueDate < localDateKey(now);
  }

  /**
   * Checks a draft and turns its date into a timestamp at the end of that day.
   * When editing `current`, an unchanged date keeps the task's original timestamp.
   */
  static details(draft: TaskDraft, current?: Task): TaskDetails {
    const title = draft.title.trim();
    if (!title) throw new DomainError("TITLE_REQUIRED", "Hãy nhập tên công việc.");
    const dueAt = !draft.dueDate ? null
      : current?.dueDate === draft.dueDate ? current.dueAt
      : new Date(`${draft.dueDate}T23:59:00`).toISOString();
    return { title, priority: draft.priority, dueAt };
  }
}
