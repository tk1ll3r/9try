import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { chatModule } from "../chat.module";
import { chatKey } from "./useChat";
import { t } from "../../../kernel/i18n";

/** `/chat/with/:userId` and `/chat/group/:groupId`: find or create the conversation, then go to it. */
export function OpenChatPage() {
  const { userId, groupId } = useParams();
  // What another screen handed over for the first message (a line to write, a card) goes on to the conversation.
  const handed = useSearchParams()[0].toString();
  const chat = useModule(chatModule);
  const opened = useQuery({
    queryKey: [...chatKey, "open", userId ?? groupId],
    queryFn: () => userId ? chat.openDirect(userId) : chat.openGroup(groupId!),
    staleTime: Infinity,
  });
  if (opened.data) return <Navigate to={`/chat/${opened.data}${handed ? `?${handed}` : ""}`} replace />;
  if (opened.isError) return <div role="alert" className="space-y-3 rounded-2xl bg-[var(--soft)] p-4 text-sm">
    <p className="text-[var(--danger)]">{errorMessage(opened.error, t("Không mở được cuộc trò chuyện."))}</p>
    <Link to="/chat" className="font-semibold underline">{t("Về danh sách trò chuyện")}</Link>
  </div>;
  return <p role="status">{t("Đang mở cuộc trò chuyện…")}</p>;
}
