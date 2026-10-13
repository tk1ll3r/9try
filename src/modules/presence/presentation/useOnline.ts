import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useModule } from "../../../kernel/session";
import type { OnlineFriend } from "../domain/Online";
import { presenceModule } from "../presence.module";
import { presenceKey } from "./modes";

/** Under "presence", so the server's "presence" event reloads it together with the modes. */
export const onlineKey = [...presenceKey, "online"] as const;

/**
 * The friends who let the user see whether their app is open, by user id. A friend who is not in the
 * map does not share it. The server tells when someone appears or leaves; the timer covers a friend
 * whose phone simply stopped calling.
 */
export function useFriendPresence(): ReadonlyMap<string, OnlineFriend> {
  const { online } = useModule(presenceModule);
  // A server without presence has nobody to show, which is what "status unavailable" already says.
  const list = useQuery({ queryKey: [...onlineKey, "friends"], queryFn: () => online.friends().catch(() => []), refetchInterval: 90_000, staleTime: 60_000 });
  return useMemo(() => new Map((list.data ?? []).map(friend => [friend.userId, friend])), [list.data]);
}
