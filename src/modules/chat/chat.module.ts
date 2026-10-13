import { MessageCircle } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { type ChatRepository } from "./domain/Chat";
import { SupabaseChatRepository } from "./infrastructure/SupabaseChatRepository";
import { ChatStatsCard } from "./presentation/ChatStatsCard";
import { ChatUnreadBadge } from "./presentation/ChatUnreadBadge";
import { t } from "../../kernel/i18n";

const chatPage = lazyRoute(() => import("./presentation/ChatPage").then(m => ({ default: m.ChatPage })));
const openChatPage = lazyRoute(() => import("./presentation/OpenChatPage").then(m => ({ default: m.OpenChatPage })));

export const chatModule: FeatureModule<ChatRepository> = {
  id: "chat",
  create: ({ userId }) => new SupabaseChatRepository(requireSupabase(), userId),
  // The home screen reads these through useConversations and useRooms, so opening Mode does not ask again.
  searchItems: async chat => (await chat.conversations()).map(conversation => ({ title: conversation.title, kind: t("Trò chuyện"), to: `/chat/${conversation.id}` })),
  navigation: [{ tab: "chat", to: "/chat", label: t("Trò chuyện"), icon: MessageCircle, order: 10, badge: ChatUnreadBadge, primary: 3 }],
  stats: { order: 70, card: ChatStatsCard },
  routes: [
    { path: "chat", ...chatPage },
    { path: "chat/:conversationId", ...chatPage },
    // Links from a friend or a group: find or create the conversation, then show it.
    { path: "chat/with/:userId", ...openChatPage },
    { path: "chat/group/:groupId", ...openChatPage },
  ],
};
