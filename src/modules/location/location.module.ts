import { MapPin } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import { LocationController } from "./application/LocationController";
import type { LocationRepository } from "./domain/Location";
import { SupabaseLocationRepository } from "./infrastructure/SupabaseLocationRepository";
import { SharingIndicator } from "./presentation/SharingIndicator";

export interface LocationServices {
  locations: LocationRepository;
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
    return { locations, sharing, dispose: () => sharing.dispose() };
  },
  indicator: SharingIndicator,
  navigation: [{ tab: "together", to: "/me/location", label: "Vị trí", icon: MapPin, order: 40 }],
  routes: [{ path: "me/location", component: lazy(() => import("./presentation/LocationPage").then(m => ({ default: m.LocationPage }))) }],
};
