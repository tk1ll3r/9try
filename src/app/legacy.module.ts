import { CalendarCheck2, CalendarDays, Home, ListChecks } from "lucide-react";
import { lazy } from "react";
import type { FeatureModule } from "../kernel/module";

// Pages that have not moved into `src/modules` yet. This list only shrinks.
export const legacyModule: FeatureModule = {
  id: "legacy",
  navigation: [
    { tab: "today", to: "/", label: "Hôm nay", icon: Home, order: 10 },
    { tab: "plan", to: "/calendar", label: "Lịch", icon: CalendarDays, order: 10 },
    { tab: "plan", to: "/me/organizer", label: "Việc & ghi chú", icon: ListChecks, order: 20 },
    { tab: "together", to: "/meetups", label: "Hoạt động", icon: CalendarCheck2, order: 30 },
  ],
  routes: [
    { path: "", component: lazy(() => import("../features/home/presentation/HomePage").then(m => ({ default: m.HomePage }))) },
    { path: "meetups", component: lazy(() => import("../features/meetups/presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) },
    { path: "calendar", component: lazy(() => import("../features/calendars/presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("../features/calendars/presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
    { path: "me/organizer", component: lazy(() => import("../features/personal/presentation/OrganizerPage").then(m => ({ default: m.OrganizerPage }))) },
  ],
};
