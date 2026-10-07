import { CircleUserRound } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { ProfileRepository } from "./domain/Profile";
import { SupabaseProfileRepository } from "./infrastructure/SupabaseProfileRepository";

export const identityModule: FeatureModule<ProfileRepository> = {
  id: "identity",
  create: ({ userId }) => new SupabaseProfileRepository(requireSupabase(), userId),
  navigation: [{ tab: "me", to: "/me", label: "Hồ sơ", icon: CircleUserRound, order: 10 }],
  routes: [{ path: "me", component: lazy(() => import("./presentation/ProfilePage").then(m => ({ default: m.ProfilePage }))) }],
};
