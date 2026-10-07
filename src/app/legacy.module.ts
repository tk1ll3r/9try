import { CalendarCheck2 } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../kernel/module";

// Pages that have not moved into `src/modules` yet. This list only shrinks.
export const legacyModule: FeatureModule = {
  id: "legacy",
  navigation: [
    { tab: "together", to: "/meetups", label: "Hoạt động", icon: CalendarCheck2, order: 30 },
  ],
  routes: [
    { path: "meetups", component: lazy(() => import("../features/meetups/presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) },
  ],
};
