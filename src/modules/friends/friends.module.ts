import { Users } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { FriendRepository } from "./domain/Friend";
import { SupabaseFriendRepository } from "./infrastructure/SupabaseFriendRepository";
import { FriendRequestsCard } from "./presentation/FriendRequestsCard";
import { FriendsPrivacy } from "./presentation/FriendsPrivacy";

export const friendsModule: FeatureModule<FriendRepository> = {
  id: "friends",
  create: () => new SupabaseFriendRepository(requireSupabase()),
  privacy: FriendsPrivacy,
  today: { order: 5, card: FriendRequestsCard },
  searchItems: async friends => (await friends.list()).filter(friend => friend.status === "accepted")
    .map(friend => ({ title: friend.displayName, kind: "Bạn bè", to: "/me/friends", keywords: friend.username ?? "" })),
  navigation: [{ tab: "together", to: "/me/friends", label: "Bạn bè", icon: Users, order: 10 }],
  routes: [
    { path: "me/friends", component: lazy(() => import("./presentation/FriendsPage").then(m => ({ default: m.FriendsPage }))) },
    { path: "invite/friend/:token", component: lazy(() => import("./presentation/FriendInvitePage").then(m => ({ default: m.FriendInvitePage }))) },
  ],
};
