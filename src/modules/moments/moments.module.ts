import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { type MomentRepository } from "./domain/Moment";
import { SupabaseMomentRepository } from "./infrastructure/SupabaseMomentRepository";
import { MomentPrivacy } from "./presentation/MomentPrivacy";

const momentsPage = lazyRoute(() => import("./presentation/MomentsPage").then(m => ({ default: m.MomentsPage })));
const momentArchivePage = lazyRoute(() => import("./presentation/MomentArchivePage").then(m => ({ default: m.MomentArchivePage })));

/**
 * Photos of the day ("Khoảnh khắc"). The frame that shows them is on the Mode screen, which gets it
 * from this module's index; these routes are where one person's photos are looked at.
 */
export const momentsModule: FeatureModule<MomentRepository> = {
  id: "moments",
  create: ({ userId }) => new SupabaseMomentRepository(requireSupabase(), userId),
  // The home screen reads these through useMoments, so opening Mode does not ask again.
  privacy: MomentPrivacy,
  routes: [
    { path: "moments", ...momentsPage },
    { path: "moments/archive", ...momentArchivePage },
    { path: "moments/:userId", ...momentsPage },
    { path: "moments/:userId/:momentId", ...momentsPage },
  ],
};
