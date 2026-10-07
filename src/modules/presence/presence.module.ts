import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { PresenceRepository } from "./domain/ActivityMode";
import { SupabasePresenceRepository } from "./infrastructure/SupabasePresenceRepository";

export const presenceModule: FeatureModule<PresenceRepository> = {
  id: "presence",
  create: () => new SupabasePresenceRepository(requireSupabase()),
};
