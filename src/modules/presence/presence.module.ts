import { Radio } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase, restApi } from "../../kernel/supabase";
import { OnlineHeartbeat } from "./application/OnlineHeartbeat";
import type { PresenceRepository } from "./domain/ActivityMode";
import type { OnlineRepository } from "./domain/Online";
import { browserPage } from "./infrastructure/browserPage";
import { SupabaseOnlineRepository } from "./infrastructure/SupabaseOnlineRepository";
import { SupabasePresenceRepository } from "./infrastructure/SupabasePresenceRepository";
import { PresenceBeacon } from "./presentation/PresenceBeacon";
import { PresencePrivacy } from "./presentation/PresencePrivacy";

export interface PresenceServices {
  /** What people say they are doing. */
  modes: PresenceRepository;
  /** Whether the app is open on a person's device, for the friends they share that with. */
  online: OnlineRepository;
  /** Lives as long as the session, so the server hears from this tab on every screen. */
  heartbeat: OnlineHeartbeat;
  dispose(): void;
}

export const presenceModule: FeatureModule<PresenceServices> = {
  id: "presence",
  create: ({ userId }) => {
    const online = new SupabaseOnlineRepository(requireSupabase(), userId, restApi);
    const heartbeat = new OnlineHeartbeat({ sessionId: crypto.randomUUID(), beat: id => online.beat(id), leave: id => online.leave(id), page: browserPage() });
    return { modes: new SupabasePresenceRepository(requireSupabase(), userId), online, heartbeat, dispose: () => heartbeat.dispose() };
  },
  // The app's home screen: what each friend is doing right now.
  navigation: [{ tab: "mode", to: "/", label: "Mode", icon: Radio, order: 1, primary: 1 }],
  routes: [{ path: "", ...lazyRoute(() => import("./presentation/ModePage").then(m => ({ default: m.ModePage }))) }],
  // Draws nothing: it is on every screen so that the heartbeat runs on every screen.
  indicator: PresenceBeacon,
  privacy: PresencePrivacy,
};
