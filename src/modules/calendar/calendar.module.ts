import { CalendarDays, GraduationCap } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { requireSupabase } from "../../shared/infrastructure/supabase";
import { SupabaseCalendarRepository } from "./infrastructure/SupabaseCalendarRepository";

export const calendarModule: FeatureModule<SupabaseCalendarRepository> = {
  id: "calendar",
  create: ({ userId }) => new SupabaseCalendarRepository(requireSupabase(), userId),
  navigation: [
    { tab: "plan", to: "/calendar", label: "Lịch", icon: CalendarDays, order: 10 },
    { tab: "plan", to: "/timetable", label: "Thời khóa biểu", icon: GraduationCap, order: 15 },
  ],
  routes: [
    { path: "calendar", component: lazy(() => import("./presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "timetable", component: lazy(() => import("./presentation/TimetablePage").then(m => ({ default: m.TimetablePage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("./presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
  ],
};
