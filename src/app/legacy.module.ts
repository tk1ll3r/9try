import { lazy } from "react";
import type { FeatureModule } from "../kernel/module";

// Pages that have not moved into `src/modules` yet. This list only shrinks.
export const legacyModule: FeatureModule = {
  id: "legacy",
  routes: [
    { path: "", component: lazy(() => import("../features/home/presentation/HomePage").then(m => ({ default: m.HomePage }))) },
    { path: "groups", component: lazy(() => import("../features/groups/presentation/GroupsPage").then(m => ({ default: m.GroupsPage }))) },
    { path: "groups/:groupId", component: lazy(() => import("../features/groups/presentation/GroupManagePage").then(m => ({ default: m.GroupManagePage }))) },
    { path: "invite/group/:token", component: lazy(() => import("../features/groups/presentation/GroupInvitePage").then(m => ({ default: m.GroupInvitePage }))) },
    { path: "meetups", component: lazy(() => import("../features/meetups/presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage }))) },
    { path: "calendar", component: lazy(() => import("../features/calendars/presentation/CalendarPage").then(m => ({ default: m.CalendarPage }))) },
    { path: "calendar/shared/:ownerId", component: lazy(() => import("../features/calendars/presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage }))) },
    { path: "me", component: lazy(() => import("../features/personal/presentation/ProfilePage").then(m => ({ default: m.ProfilePage }))) },
    { path: "me/friends", component: lazy(() => import("../features/friends/presentation/FriendsPage").then(m => ({ default: m.FriendsPage }))) },
    { path: "me/organizer", component: lazy(() => import("../features/personal/presentation/OrganizerPage").then(m => ({ default: m.OrganizerPage }))) },
    { path: "me/location", component: lazy(() => import("../features/location-sharing/presentation/LocationSharingPage").then(m => ({ default: m.LocationSharingPage }))) },
  ],
};
