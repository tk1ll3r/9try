import { ChartColumn } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { t } from "../../kernel/i18n";

/** The statistics screen. It counts nothing itself: every module with something to count adds a card through `stats`. */
export const statsModule: FeatureModule = {
  id: "stats",
  navigation: [{ tab: "stats", to: "/stats", label: t("Thống kê"), icon: ChartColumn, order: 10 }],
  routes: [{ path: "stats", component: lazy(() => import("./presentation/StatsPage").then(m => ({ default: m.StatsPage }))) }],
};
