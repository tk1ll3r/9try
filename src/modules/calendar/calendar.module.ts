import { CalendarDays, CalendarSearch, GraduationCap } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../../kernel/module";
import { functionsUrl, requireSupabase } from "../../kernel/supabase";
import { SupabaseCalendarRepository } from "./infrastructure/SupabaseCalendarRepository";
import { CalendarPrivacy } from "./presentation/CalendarPrivacy";
import { CalendarStatsCard } from "./presentation/CalendarStatsCard";
import { UpcomingCard } from "./presentation/UpcomingCard";
import { t } from "../../kernel/i18n";

export const calendarModule: FeatureModule<SupabaseCalendarRepository> = {
  id: "calendar",
  create: ({ userId }) => new SupabaseCalendarRepository(requireSupabase(), userId, `${functionsUrl}/calendar-feed`),
  privacy: CalendarPrivacy,
  today: { order: 10, card: UpcomingCard },
  stats: { order: 40, card: CalendarStatsCard },
  searchItems: async calendar => (await calendar.listEvents()).map(event => event.category === "class"
    ? { title: event.title, kind: t("Lớp học"), to: "/timetable", keywords: event.place ?? "" }
    : { title: event.title, kind: t("Sự kiện"), to: "/calendar", keywords: event.place ?? "" }),
  navigation: [
    { tab: "plan", to: "/calendar", label: t("Lịch"), icon: CalendarDays, order: 10 },
    { tab: "plan", to: "/timetable", label: t("Thời khóa biểu"), icon: GraduationCap, order: 15, parent: "/calendar" },
    { tab: "together", to: "/free-time", label: t("Rảnh lúc nào?"), icon: CalendarSearch, order: 35, parent: "/meetups" },
  ],
  routes: [
    { path: "calendar", component: lazy(() => import("./presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "timetable", component: lazy(() => import("./presentation/TimetablePage").then(m => ({ default: m.TimetablePage }))) },
    { path: "free-time", component: lazy(() => import("./presentation/FreeTimePage").then(m => ({ default: m.FreeTimePage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("./presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
  ],
};
