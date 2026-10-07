import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { chatModule } from "../chat.module";
import { chatKey } from "./useChat";

/** `/chat/with/:userId` and `/chat/group/:groupId`: find or create the conversation, then go to it. */
export function OpenChatPage() {
  const { userId, groupId } = useParams();
  const chat = useModule(chatModule);
  const opened = useQuery({
    queryKey: [...chatKey, "open", userId ?? groupId],
    queryFn: () => userId ? chat.openDirect(userId) : chat.openGroup(groupId!),
    staleTime: Infinity,
  });
  if (opened.data) return <Navigate to={`/chat/${opened.data}`} replace />;
  if (opened.isError) return <div role="alert" className="space-y-3 rounded-2xl bg-[var(--soft)] p-4 text-sm">
    <p className="text-[var(--danger)]">{errorMessage(opened.error, "Không mở được cuộc trò chuyện.")}</p>
    <Link to="/chat" className="font-semibold underline">Về danh sách trò chuyện</Link>
  </div>;
  return <p role="status">Đang mở cuộc trò chuyện…</p>;
}
