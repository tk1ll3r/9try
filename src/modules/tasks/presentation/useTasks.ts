import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import type { TaskService } from "../application/TaskService";
import { tasksModule } from "../tasks.module";

const all = ["tasks"] as const;

export function useAllTasks() {
  const tasks = useModule(tasksModule);
  return useQuery({ queryKey: [...all, "list"], queryFn: () => tasks.list() });
}

export function useTodayTasks() {
  const tasks = useModule(tasksModule);
  return useQuery({ queryKey: [...all, "today"], queryFn: () => tasks.dueToday() });
}

/** One task change at a time; every task list reloads afterwards. */
export function useTaskChange() {
  const tasks = useModule(tasksModule);
  const { run, pending, error } = useAction(all);
  return {
    pending, error,
    run: <Result,>(change: (tasks: TaskService) => Promise<Result>, onDone?: (result: Result) => void) => run(() => change(tasks), onDone),
  };
}
