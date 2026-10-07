import { Home } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";

export const todayModule: FeatureModule = {
  id: "today",
  navigation: [{ tab: "today", to: "/", label: "Hôm nay", icon: Home, order: 10 }],
  routes: [{ path: "", component: lazy(() => import("./presentation/TodayPage").then(m => ({ default: m.TodayPage }))) }],
};
