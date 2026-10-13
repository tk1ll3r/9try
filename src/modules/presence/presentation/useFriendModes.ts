import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useModule } from "../../../kernel/session";
import { presenceModule } from "../presence.module";
import { choiceOf, presenceKey, type ModeChoice } from "./modes";

/**
 * What each person is doing right now, by user id, for the screens of other features: the map draws
 * a friend's ring in that color. It is the Mode screen's own query, so the two never disagree.
 */
export function useFriendModes(): ReadonlyMap<string, ModeChoice> {
  const { modes } = useModule(presenceModule);
  const list = useQuery({ queryKey: presenceKey, queryFn: () => modes.list(), refetchInterval: 120_000, staleTime: 60_000 });
  return useMemo(() => {
    const now = Date.now();
    return new Map((list.data ?? []).filter(item => Date.parse(item.expiresAt) > now).map(item => [item.userId, choiceOf(item.mode, item)!]));
  }, [list.data]);
}
