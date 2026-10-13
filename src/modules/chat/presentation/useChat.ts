import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { chatModule } from "../chat.module";

export const chatKey = ["chat"] as const;

/** The rooms the user is in or may join. A server without rooms simply has none. */
export function useRooms() {
  const chat = useModule(chatModule);
  return useQuery({ queryKey: [...chatKey, "rooms"], queryFn: () => chat.rooms().catch(() => []), refetchInterval: 180_000, staleTime: 60_000 });
}

export function useConversations() {
  const chat = useModule(chatModule);
  // The realtime "chat" event reloads this at once. The timer only covers an event that was missed.
  return useQuery({ queryKey: [...chatKey, "conversations"], queryFn: () => chat.conversations(), refetchInterval: 120_000, staleTime: 60_000 });
}
