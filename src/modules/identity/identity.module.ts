import { CircleUserRound, Settings, ShieldCheck } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { ProfileRepository } from "./domain/Profile";
import { SupabaseProfileRepository } from "./infrastructure/SupabaseProfileRepository";
import { AccountSettings } from "./presentation/AccountSettings";
import { InstallCard } from "./presentation/InstallCard";
import { t } from "../../kernel/i18n";

export const identityModule: FeatureModule<ProfileRepository> = {
  id: "identity",
  create: ({ userId }) => new SupabaseProfileRepository(requireSupabase(), userId),
  navigation: [
    { tab: "me", to: "/me", label: t("Hồ sơ"), icon: CircleUserRound, order: 10 },
    { tab: "me", to: "/me/privacy", label: t("Quyền riêng tư"), icon: ShieldCheck, order: 20, parent: "/me" },
    { tab: "me", to: "/me/settings", label: t("Cài đặt"), icon: Settings, order: 30, parent: "/me" },
  ],
  today: { order: 2, card: InstallCard },
  settings: AccountSettings,
  routes: [
    { path: "me", ...lazyRoute(() => import("./presentation/ProfilePage").then(m => ({ default: m.ProfilePage }))) },
    { path: "me/privacy", ...lazyRoute(() => import("./presentation/PrivacyPage").then(m => ({ default: m.PrivacyPage }))) },
    { path: "me/settings", ...lazyRoute(() => import("./presentation/SettingsPage").then(m => ({ default: m.SettingsPage }))) },
  ],
};
