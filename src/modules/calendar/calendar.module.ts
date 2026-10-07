import { CalendarDays, CalendarSearch, GraduationCap } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { functionsUrl, requireSupabase } from "../../kernel/supabase";
import { SupabaseCalendarRepository } from "./infrastructure/SupabaseCalendarRepository";
import { CalendarPrivacy } from "./presentation/CalendarPrivacy";

export const calendarModule: FeatureModule<SupabaseCalendarRepository> = {
  id: "calendar",
  create: ({ userId }) => new SupabaseCalendarRepository(requireSupabase(), userId, `${functionsUrl}/calendar-feed`),
  privacy: CalendarPrivacy,
  searchItems: async calendar => (await calendar.listEvents()).map(event => event.category === "class"
    ? { title: event.title, kind: "Lớp học", to: "/timetable", keywords: event.place ?? "" }
    : { title: event.title, kind: "Sự kiện", to: "/calendar", keywords: event.place ?? "" }),
  navigation: [
    { tab: "plan", to: "/calendar", label: "Lịch", icon: CalendarDays, order: 10 },
    { tab: "plan", to: "/timetable", label: "Thời khóa biểu", icon: GraduationCap, order: 15 },
    { tab: "together", to: "/free-time", label: "Rảnh lúc nào?", icon: CalendarSearch, order: 35 },
  ],
  routes: [
    { path: "calendar", component: lazy(() => import("./presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "timetable", component: lazy(() => import("./presentation/TimetablePage").then(m => ({ default: m.TimetablePage }))) },
    { path: "free-time", component: lazy(() => import("./presentation/FreeTimePage").then(m => ({ default: m.FreeTimePage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("./presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
  ],
};
