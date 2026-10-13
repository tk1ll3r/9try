import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { presenceModule } from "../presence.module";
import type { CustomActivityMode } from "../domain/ActivityMode";
import { presenceKey } from "./modes";

const customModesKey = [...presenceKey, "custom"] as const;

/** The signed-in person's saved modes; active friends' mode snapshots use the main presence query. */
export function useCustomModes() {
  const { modes } = useModule(presenceModule);
  return useQuery({ queryKey: customModesKey, queryFn: () => modes.customModes(), staleTime: 60_000 });
}

/** Creates a reusable mode and refreshes both the catalog and active presence snapshots. */
export function useCreateCustomMode() {
  const { modes } = useModule(presenceModule);
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (mode: Omit<CustomActivityMode, "mode">) => modes.createCustomMode(mode),
    onSuccess: async () => { await queries.invalidateQueries({ queryKey: presenceKey }); },
  });
}
