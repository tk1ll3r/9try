import { Repeat } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { HabitRepository } from "./domain/Habit";
import { SupabaseHabitRepository } from "./infrastructure/SupabaseHabitRepository";
import { HabitStatsCard } from "./presentation/HabitStatsCard";
import { TodayHabitsCard } from "./presentation/TodayHabitsCard";
import { t } from "../../kernel/i18n";

export const habitsModule: FeatureModule<HabitRepository> = {
  id: "habits",
  create: ({ userId }) => new SupabaseHabitRepository(requireSupabase(), userId),
  searchItems: async habits => (await habits.list()).map(habit => ({ title: habit.title, kind: t("Thói quen"), to: "/habits" })),
  navigation: [{ tab: "plan", to: "/habits", label: t("Thói quen"), icon: Repeat, order: 22, parent: "/me/organizer" }],
  today: { order: 30, card: TodayHabitsCard },
  stats: { order: 20, card: HabitStatsCard },
  routes: [{ path: "habits", component: lazy(() => import("./presentation/HabitsPage").then(m => ({ default: m.HabitsPage }))) }],
};
