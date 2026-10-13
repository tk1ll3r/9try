import { Sun } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { t } from "../../kernel/i18n";

export const todayModule: FeatureModule = {
  id: "today",
  navigation: [{ tab: "today", to: "/today", label: t("Hôm nay"), icon: Sun, order: 10 }],
  routes: [{ path: "today", ...lazyRoute(() => import("./presentation/TodayPage").then(m => ({ default: m.TodayPage }))) }],
};
