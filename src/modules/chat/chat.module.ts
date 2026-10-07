import { MessageCircle } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { ChatRepository } from "./domain/Chat";
import { SupabaseChatRepository } from "./infrastructure/SupabaseChatRepository";
import { ChatUnreadBadge } from "./presentation/ChatUnreadBadge";

const ChatPage = lazy(() => import("./presentation/ChatPage").then(m => ({ default: m.ChatPage })));
const OpenChatPage = lazy(() => import("./presentation/OpenChatPage").then(m => ({ default: m.OpenChatPage })));

export const chatModule: FeatureModule<ChatRepository> = {
  id: "chat",
  create: () => new SupabaseChatRepository(requireSupabase()),
  navigation: [{ tab: "chat", to: "/chat", label: "Trò chuyện", icon: MessageCircle, order: 10, badge: ChatUnreadBadge }],
  routes: [
    { path: "chat", component: ChatPage },
    { path: "chat/:conversationId", component: ChatPage },
    // Links from a friend or a group: find or create the conversation, then show it.
    { path: "chat/with/:userId", component: OpenChatPage },
    { path: "chat/group/:groupId", component: OpenChatPage },
  ],
};
