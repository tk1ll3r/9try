import { CalendarDays } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import { SupabaseCalendarRepository } from "./infrastructure/SupabaseCalendarRepository";

export const calendarModule: FeatureModule<SupabaseCalendarRepository> = {
  id: "calendar",
  create: ({ userId }) => new SupabaseCalendarRepository(requireSupabase(), userId),
  navigation: [{ tab: "plan", to: "/calendar", label: "Lịch", icon: CalendarDays, order: 10 }],
  routes: [
    { path: "calendar", component: lazy(() => import("./presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("./presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
  ],
};
