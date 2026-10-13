import { CalendarDays, GraduationCap, Share2 } from "lucide-react";
import { lazyRoute } from "../../kernel/lazyRoute";
import type { FeatureModule } from "../../kernel/module";
import { functionsUrl, requireSupabase } from "../../kernel/supabase";
import { SupabaseCalendarRepository } from "./infrastructure/SupabaseCalendarRepository";
import { CalendarPrivacy } from "./presentation/CalendarPrivacy";
import { CalendarStatsCard } from "./presentation/CalendarStatsCard";
import { UpcomingCard } from "./presentation/UpcomingCard";
import { ScheduleBadge } from "./presentation/useScheduleSharing";
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
    // The badge counts the friends who asked to see the schedule and wait for an answer.
    { tab: "plan", to: "/calendar", label: t("Lịch"), icon: CalendarDays, order: 10, primary: 2, badge: ScheduleBadge },
    { tab: "plan", to: "/timetable", label: t("Thời khóa biểu"), icon: GraduationCap, order: 15, parent: "/calendar" },
    { tab: "plan", to: "/calendar/requests", label: t("Chia sẻ lịch"), icon: Share2, order: 16, parent: "/calendar", badge: ScheduleBadge },
  ],
  routes: [
    { path: "calendar", ...lazyRoute(() => import("./presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "timetable", ...lazyRoute(() => import("./presentation/TimetablePage").then(m => ({ default: m.TimetablePage }))) },
    { path: "free-time", ...lazyRoute(() => import("./presentation/FreeTimePage").then(m => ({ default: m.FreeTimePage }))) },
    { path: "calendar/requests", ...lazyRoute(() => import("./presentation/ScheduleRequestsPage").then(m => ({ default: m.ScheduleRequestsPage }))) },
    { path: "calendar/shared/:ownerId", ...lazyRoute(() => import("./presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
  ],
};
