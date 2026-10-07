import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
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

type Change<Result> = (tasks: TaskService) => Promise<Result>;

/**
 * Runs one change at a time, then reloads every task list. `pending` stays true until the
 * lists are fresh, and a call made while another is running is ignored (double taps).
 */
export function useTaskChange() {
  const tasks = useModule(tasksModule);
  const queries = useQueryClient();
  const busy = useRef(false);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (change: Change<unknown>) => change(tasks),
    onError: cause => setError(errorMessage(cause, "Thao tác chưa thành công. Hãy thử lại.")),
    onSettled: async () => {
      await queries.invalidateQueries({ queryKey: all });
      busy.current = false;
    },
  });

  function run<Result>(change: Change<Result>, onDone?: (result: Result) => void) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    mutation.mutate(change, { onSuccess: result => onDone?.(result as Result) });
  }

  return { run, pending: mutation.isPending, error };
}
