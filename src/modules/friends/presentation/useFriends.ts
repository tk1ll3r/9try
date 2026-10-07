import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
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

const nobody: ReadonlySet<string> = new Set();
const pinsKey = [...friendsKey, "pins"] as const;

/** The friends the user pinned, and a way to pin or unpin one. `available` is false on a database without pins. */
export function useFriendPins() {
  const friends = useModule(friendsModule);
  const pins = useQuery({ queryKey: pinsKey, queryFn: () => friends.pinned() });
  const { run, pending, error } = useAction(pinsKey);
  return {
    pinned: pins.data ?? nobody, available: pins.isSuccess, pending, error,
    toggle: (userId: string) => run(() => friends.setPinned(userId, !pins.data?.has(userId))),
  };
}
