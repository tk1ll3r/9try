import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { errorMessage } from "./errors";

/**
 * Runs one change at a time, then reloads every query under `root`. `pending` stays true
 * until that data is fresh, and a call made while another is running is ignored (double taps).
 */
export function useAction(root: readonly unknown[]) {
  const queries = useQueryClient();
  const busy = useRef(false);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (job: () => Promise<unknown>) => job(),
    onError: cause => setError(errorMessage(cause, "Thao tác chưa thành công. Hãy thử lại.")),
    onSettled: async () => {
      await queries.invalidateQueries({ queryKey: root });
      busy.current = false;
    },
  });

  function run<Result>(job: () => Promise<Result>, onDone?: (result: Result) => void) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    mutation.mutate(job, { onSuccess: result => onDone?.(result as Result) });
  }

  return { run, pending: mutation.isPending, error };
}
