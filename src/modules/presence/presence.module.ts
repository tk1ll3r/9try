import { Radio } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { PresenceRepository } from "./domain/ActivityMode";
import { SupabasePresenceRepository } from "./infrastructure/SupabasePresenceRepository";
import { FriendsNowCard } from "./presentation/FriendsNowCard";
import { PresencePrivacy } from "./presentation/PresencePrivacy";

export const presenceModule: FeatureModule<PresenceRepository> = {
  id: "presence",
  create: () => new SupabasePresenceRepository(requireSupabase()),
  // The app's home screen: what each friend is doing right now.
  navigation: [{ tab: "mode", to: "/", label: "Mode", icon: Radio, order: 1 }],
  routes: [{ path: "", component: lazy(() => import("./presentation/ModePage").then(m => ({ default: m.ModePage }))) }],
  privacy: PresencePrivacy,
  today: { order: 1, card: FriendsNowCard },
};
