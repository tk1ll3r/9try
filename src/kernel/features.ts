import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "./supabase";

/** Reloaded by the server's "features" event, which is sent when a capability is given or taken back. */
export const featuresKey = ["features"] as const;

/**
 * The capabilities the server gave this account, such as "couple_expenses". A screen that needs one
 * is listed nowhere without it. This only decides what the app shows: the server checks the
 * capability again on every read and every change.
 *
 * `ready` is false until the server has answered. `has` is false until then, on an error, and on a
 * server that knows no capabilities.
 */
export function useFeatures(): { ready: boolean; has(feature: string): boolean } {
  const granted = useQuery({
    queryKey: featuresKey,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc("my_features");
      if (error) throw error;
      return (data ?? []) as string[];
    },
    enabled: !!supabase,
    staleTime: 5 * 60_000,
  });
  const given = granted.data;
  // The same object until the answer changes, so what is built from it is not rebuilt on every render.
  return useMemo(() => ({ ready: !granted.isPending, has: (feature: string) => given?.includes(feature) ?? false }), [given, granted.isPending]);
}
