import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import type { FriendConnection } from "../domain/Friend";
import { friendsModule } from "../friends.module";

export const friendsKey = ["friends"] as const;

export function useFriendConnections() {
  const friends = useModule(friendsModule);
  return useQuery({ queryKey: [...friendsKey, "list"], queryFn: () => friends.list() });
}

/** Accepted friends only; empty while loading. */
export function useAcceptedFriends(): FriendConnection[] {
  return (useFriendConnections().data ?? []).filter(friend => friend.status === "accepted");
}
