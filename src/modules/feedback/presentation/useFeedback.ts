import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { feedbackModule } from "../feedback.module";

export const feedbackKey = ["feedback"] as const;

export function useFeedbackRecipient() {
  const repository = useModule(feedbackModule);
  return useQuery({ queryKey: [...feedbackKey, "recipient"], queryFn: () => repository.isRecipient(), staleTime: 60_000 });
}

export function useFeedbackInbox(enabled: boolean) {
  const repository = useModule(feedbackModule);
  return useQuery({ queryKey: [...feedbackKey, "inbox"], queryFn: () => repository.inbox(), enabled, staleTime: 30_000 });
}
