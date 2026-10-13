import { Users } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { FriendRepository } from "./domain/Friend";
import { SupabaseFriendRepository } from "./infrastructure/SupabaseFriendRepository";
import { FriendRequestsCard } from "./presentation/FriendRequestsCard";
import { FriendsPrivacy } from "./presentation/FriendsPrivacy";
import { t } from "../../kernel/i18n";

export const friendsModule: FeatureModule<FriendRepository> = {
  id: "friends",
  create: () => new SupabaseFriendRepository(requireSupabase()),
  privacy: FriendsPrivacy,
  today: { order: 5, card: FriendRequestsCard },
  searchItems: async friends => (await friends.list()).filter(friend => friend.status === "accepted")
    .map(friend => ({ title: friend.displayName, kind: t("Bạn bè"), to: "/me/friends", keywords: friend.username ?? "" })),
  navigation: [{ tab: "together", to: "/me/friends", label: t("Bạn bè"), icon: Users, order: 10 }],
  routes: [
    { path: "me/friends", ...lazyRoute(() => import("./presentation/FriendsPage").then(m => ({ default: m.FriendsPage }))) },
    { path: "invite/friend/:token", ...lazyRoute(() => import("./presentation/FriendInvitePage").then(m => ({ default: m.FriendInvitePage }))) },
  ],
};
