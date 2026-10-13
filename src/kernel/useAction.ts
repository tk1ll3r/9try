import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { errorMessage } from "./errors";
import { t } from "./i18n";

interface Call {
  job: () => Promise<unknown>;
  done?: (result: unknown) => void;
}

/**
 * Runs one change at a time, then reloads every query under `root`. `pending` stays true
 * until that data is fresh, and a call made while another is running is ignored (double taps).
 *
 * `onDone` runs after the reload, also when the reload took away the part of the screen that asked:
 * someone who leaves a room is no longer shown that room's bar, and must still be led back to the
 * list. That is why it is called from here and not handed to `mutate`, whose own callbacks are
 * dropped once the asking component is gone.
 */
export function useAction(root: readonly unknown[]) {
  const queries = useQueryClient();
  const busy = useRef(false);
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (call: Call) => call.job(),
    onError: cause => setError(errorMessage(cause, t("Thao tác chưa thành công. Hãy thử lại."))),
    onSettled: async (result, cause, call) => {
      await queries.invalidateQueries({ queryKey: root });
      busy.current = false;
      if (!cause) call.done?.(result);
    },
  });

  function run<Result>(job: () => Promise<Result>, onDone?: (result: Result) => void) {
    if (busy.current) return;
    busy.current = true;
    setError("");
    mutation.mutate({ job, done: onDone as Call["done"] });
  }

  return { run, pending: mutation.isPending, error };
}
