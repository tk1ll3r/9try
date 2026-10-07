import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { PresenceRepository } from "./domain/ActivityMode";
import { SupabasePresenceRepository } from "./infrastructure/SupabasePresenceRepository";
import { FriendsNowCard } from "./presentation/FriendsNowCard";
import { PresencePrivacy } from "./presentation/PresencePrivacy";

export const presenceModule: FeatureModule<PresenceRepository> = {
  id: "presence",
  create: () => new SupabasePresenceRepository(requireSupabase()),
  privacy: PresencePrivacy,
  today: { order: 40, card: FriendsNowCard },
};
