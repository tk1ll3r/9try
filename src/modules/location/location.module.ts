import { MapPin } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import { LocationController } from "./application/LocationController";
import { spaced } from "./application/spaced";
import { locationSignals, type LocationRepository, type VisibleLocation } from "./domain/Location";
import { SupabaseLocationRepository } from "./infrastructure/SupabaseLocationRepository";
import { LocationPrivacy } from "./presentation/LocationPrivacy";
import { SharingIndicator } from "./presentation/SharingIndicator";
import { t } from "../../kernel/i18n";

export interface LocationServices {
  locations: LocationRepository;
  /** The friends who share with the user, for the map: loaded at most once every three seconds, however many of them move. */
  visible: () => Promise<VisibleLocation[]>;
  /** Lives as long as the session, so GPS keeps publishing while the user moves between screens. */
  sharing: LocationController;
  dispose(): void;
}

export const locationModule: FeatureModule<LocationServices> = {
  id: "location",
  create: ({ userId }) => {
    const locations = new SupabaseLocationRepository(requireSupabase(), userId);
    const sharing = new LocationController({
      list: () => locations.listOwned(),
      start: (minutes, recipients, approximate) => locations.start(minutes, recipients, approximate),
      stop: id => locations.stop(id),
      publish: (id, position, approximate) => locations.publish(id, position, approximate),
      gps: navigator.geolocation,
    });
    return { locations, visible: spaced(() => locations.listVisible(), 3_000), sharing, dispose: () => sharing.dispose() };
  },
  indicator: SharingIndicator,
  friendSignals: async ({ locations }, { now }) => locationSignals(await locations.listVisible(), now),
  privacy: LocationPrivacy,
  navigation: [{ tab: "together", to: "/me/location", label: t("Vị trí"), icon: MapPin, order: 12, parent: "/me/relationships" }],
  routes: [{ path: "me/location", ...lazyRoute(() => import("./presentation/LocationPage").then(m => ({ default: m.LocationPage }))) }],
};
