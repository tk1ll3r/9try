import { CircleUserRound, ShieldCheck } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { ProfileRepository } from "./domain/Profile";
import { SupabaseProfileRepository } from "./infrastructure/SupabaseProfileRepository";
import { InstallCard } from "./presentation/InstallCard";

export const identityModule: FeatureModule<ProfileRepository> = {
  id: "identity",
  create: ({ userId }) => new SupabaseProfileRepository(requireSupabase(), userId),
  navigation: [
    { tab: "me", to: "/me", label: "Hồ sơ", icon: CircleUserRound, order: 10 },
    { tab: "me", to: "/me/privacy", label: "Quyền riêng tư", icon: ShieldCheck, order: 20 },
  ],
  today: { order: 2, card: InstallCard },
  routes: [
    { path: "me", component: lazy(() => import("./presentation/ProfilePage").then(m => ({ default: m.ProfilePage }))) },
    { path: "me/privacy", component: lazy(() => import("./presentation/PrivacyPage").then(m => ({ default: m.PrivacyPage }))) },
  ],
};
