import { MessageCircle } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { chatSignals, type ChatRepository } from "./domain/Chat";
import { SupabaseChatRepository } from "./infrastructure/SupabaseChatRepository";
import { ChatStatsCard } from "./presentation/ChatStatsCard";
import { ChatUnreadBadge } from "./presentation/ChatUnreadBadge";
import { t } from "../../kernel/i18n";

const ChatPage = lazy(() => import("./presentation/ChatPage").then(m => ({ default: m.ChatPage })));
const OpenChatPage = lazy(() => import("./presentation/OpenChatPage").then(m => ({ default: m.OpenChatPage })));

export const chatModule: FeatureModule<ChatRepository> = {
  id: "chat",
  create: () => new SupabaseChatRepository(requireSupabase()),
  friendSignals: async (chat, { now }) => chatSignals(await chat.conversations(), now),
  searchItems: async chat => (await chat.conversations()).map(conversation => ({ title: conversation.title, kind: t("Trò chuyện"), to: `/chat/${conversation.id}` })),
  navigation: [{ tab: "chat", to: "/chat", label: t("Trò chuyện"), icon: MessageCircle, order: 10, badge: ChatUnreadBadge }],
  stats: { order: 70, card: ChatStatsCard },
  routes: [
    { path: "chat", component: ChatPage },
    { path: "chat/:conversationId", component: ChatPage },
    // Links from a friend or a group: find or create the conversation, then show it.
    { path: "chat/with/:userId", component: OpenChatPage },
    { path: "chat/group/:groupId", component: OpenChatPage },
  ],
};
