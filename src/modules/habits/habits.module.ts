import { Repeat } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../kernel/supabase";
import type { HabitRepository } from "./domain/Habit";
import { SupabaseHabitRepository } from "./infrastructure/SupabaseHabitRepository";
import { TodayHabitsCard } from "./presentation/TodayHabitsCard";

export const habitsModule: FeatureModule<HabitRepository> = {
  id: "habits",
  create: ({ userId }) => new SupabaseHabitRepository(requireSupabase(), userId),
  searchItems: async habits => (await habits.list()).map(habit => ({ title: habit.title, kind: "Thói quen", to: "/habits" })),
  navigation: [{ tab: "plan", to: "/habits", label: "Thói quen", icon: Repeat, order: 22 }],
  today: { order: 30, card: TodayHabitsCard },
  routes: [{ path: "habits", component: lazy(() => import("./presentation/HabitsPage").then(m => ({ default: m.HabitsPage }))) }],
};
