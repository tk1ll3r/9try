import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import type { FriendConnection } from "../domain/Friend";
import { friendsModule } from "../friends.module";

export const friendsKey = ["friends"] as const;

export function useFriendConnections() {
  const friends = useModule(friendsModule);
  // The list carries each friend's picture, so a screen that opens does not fetch it again within a minute.
  // A change the user makes, and a "friends" event from the server, reload it at once.
  return useQuery({ queryKey: [...friendsKey, "list"], queryFn: () => friends.list(), staleTime: 60_000 });
}

/** Accepted friends only; empty while loading. The same list until the friends change, so what is built from it is not rebuilt on every render. */
export function useAcceptedFriends(): FriendConnection[] {
  const { data } = useFriendConnections();
  return useMemo(() => (data ?? []).filter(friend => friend.status === "accepted"), [data]);
}

const nobody: ReadonlySet<string> = new Set();
const pinsKey = [...friendsKey, "pins"] as const;
export const relationshipInvitesKey = [...friendsKey, "relationship-invites"] as const;
export const sharedRelationshipsKey = [...friendsKey, "shared-relationships"] as const;

export function useRelationshipInvites() {
  const friends = useModule(friendsModule);
  return useQuery({ queryKey: relationshipInvitesKey, queryFn: () => friends.relationshipInvites(), staleTime: 20_000 });
}

export function useSharedRelationships() {
  const friends = useModule(friendsModule);
  return useQuery({ queryKey: sharedRelationshipsKey, queryFn: () => friends.sharedRelationships(), staleTime: 60_000 });
}

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
