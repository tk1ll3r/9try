import { Home } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { t } from "../../kernel/i18n";

export const todayModule: FeatureModule = {
  id: "today",
  navigation: [{ tab: "today", to: "/today", label: t("Hôm nay"), icon: Home, order: 10 }],
  routes: [{ path: "today", component: lazy(() => import("./presentation/TodayPage").then(m => ({ default: m.TodayPage }))) }],
};
