import { Repeat2 } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { t } from "../../kernel/i18n";
import { requireSupabase } from "../../kernel/supabase";
import type { HabitRepository } from "./domain/Habit";
import { SupabaseHabitRepository } from "./infrastructure/SupabaseHabitRepository";
import { HabitStatsCard } from "./presentation/HabitStatsCard";
import { TodayHabitsCard } from "./presentation/TodayHabitsCard";

export const habitsModule: FeatureModule<HabitRepository> = {
  id: "habits",
  create: ({ userId }) => new SupabaseHabitRepository(requireSupabase(), userId),
  today: { order: 30, card: TodayHabitsCard },
  stats: { order: 20, card: HabitStatsCard },
  navigation: [{ tab: "plan", to: "/habits", label: t("Thói quen"), icon: Repeat2, order: 25 }],
  routes: [{ path: "habits", ...lazyRoute(() => import("./presentation/HabitsPage").then(m => ({ default: m.HabitsPage }))) }],
};
