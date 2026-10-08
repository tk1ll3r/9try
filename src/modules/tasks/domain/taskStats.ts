import { lastDays, localDateKey } from "../../../kernel/dates";
import type { Task } from "./Task";

export interface TaskStats {
  /** Completed in the days counted. */
  done: number;
  open: number;
  overdue: number;
  /** One entry for each day counted, oldest first. */
  perDay: { day: string; done: number }[];
}

/** What the last `days` days of tasks add up to. A task counts on the day it was completed, on this device. */
export function taskStats(tasks: readonly Task[], days: number, now = new Date()): TaskStats {
  const perDay = new Map(lastDays(days, now).map(day => [day, 0]));
  for (const task of tasks) {
    const day = task.completedAt && localDateKey(new Date(task.completedAt));
    if (day && perDay.has(day)) perDay.set(day, perDay.get(day)! + 1);
  }
  const open = tasks.filter(task => !task.done);
  return {
    done: [...perDay.values()].reduce((sum, count) => sum + count, 0),
    open: open.length,
    overdue: open.filter(task => task.isOverdue(now)).length,
    perDay: [...perDay].map(([day, done]) => ({ day, done })),
  };
}
