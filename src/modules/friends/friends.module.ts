import { Users } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { FriendRepository } from "./domain/Friend";
import { SupabaseFriendRepository } from "./infrastructure/SupabaseFriendRepository";

export const friendsModule: FeatureModule<FriendRepository> = {
  id: "friends",
  create: () => new SupabaseFriendRepository(requireSupabase()),
  navigation: [{ tab: "together", to: "/me/friends", label: "Bạn bè", icon: Users, order: 10 }],
  routes: [
    { path: "me/friends", component: lazy(() => import("./presentation/FriendsPage").then(m => ({ default: m.FriendsPage }))) },
    { path: "invite/friend/:token", component: lazy(() => import("./presentation/FriendInvitePage").then(m => ({ default: m.FriendInvitePage }))) },
  ],
};
