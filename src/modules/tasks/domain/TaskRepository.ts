import type { Task, TaskDetails } from "./Task";

/** Storage for the signed-in user's one-off tasks. */
export interface TaskRepository {
  /** Every task, soonest due first, undated last. */
  list(): Promise<Task[]>;
  /** Open tasks that have no due date or are due before `before`. */
  listOpenDueBefore(before: Date): Promise<Task[]>;
  add(details: TaskDetails): Promise<void>;
  update(id: string, details: TaskDetails): Promise<void>;
  setCompletedAt(id: string, completedAt: string | null): Promise<void>;
  /** Reopens the task only if it is still completed at exactly `completedAt`. */
  undoCompletion(id: string, completedAt: string): Promise<void>;
  remove(id: string): Promise<void>;
}
