import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { chatModule } from "../chat.module";

export const chatKey = ["chat"] as const;

export function useConversations() {
  const chat = useModule(chatModule);
  // ponytail: the realtime "chat" event reloads this at once; the timer covers a missed event.
  return useQuery({ queryKey: [...chatKey, "conversations"], queryFn: () => chat.conversations(), refetchInterval: 20_000 });
}
