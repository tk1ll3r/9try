import { LayoutGrid } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { ShortcutsCard } from "./presentation/ShortcutsCard";

/** The Menu lists every screen, and Today gets the person's shortcuts to the ones they use most. */
export const menuModule: FeatureModule = {
  id: "menu",
  navigation: [{ tab: "menu", to: "/menu", label: "Menu", icon: LayoutGrid, order: 10, primary: 5 }],
  today: { order: 0, card: ShortcutsCard },
  routes: [{ path: "menu", ...lazyRoute(() => import("./presentation/MenuPage").then(m => ({ default: m.MenuPage }))) }],
};
