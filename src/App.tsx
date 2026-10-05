import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./bootstrap/AuthProvider";
import { AuthPage } from "./features/auth/presentation/AuthPage";
import { CalendarPage } from "./features/calendars/presentation/CalendarPage";
import { SharedCalendarPage } from "./features/calendars/presentation/SharedCalendarPage";
import { FriendsPage } from "./features/friends/presentation/FriendsPage";
import { GroupInvitePage } from "./features/groups/presentation/GroupInvitePage";
import { GroupsPage } from "./features/groups/presentation/GroupsPage";
import { GroupManagePage } from "./features/groups/presentation/GroupManagePage";
import { HomePage } from "./features/home/presentation/HomePage";
import { LocationSharingPage } from "./features/location-sharing/presentation/LocationSharingPage";
import { MeetupsPage } from "./features/meetups/presentation/MeetupsPage";
import { NotificationsPage } from "./features/notifications/presentation/NotificationsPage";
import { OrganizerPage } from "./features/personal/presentation/OrganizerPage";
import { ProfilePage } from "./features/personal/presentation/ProfilePage";
import { AppShell } from "./shared/ui/AppShell";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-[var(--paper)] text-[var(--ink)]">Đang tải…</div>;
  }
  if (!user) return <AuthPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:groupId" element={<GroupManagePage />} />
        <Route path="invite/group/:token" element={<GroupInvitePage />} />
        <Route path="meetups" element={<MeetupsPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="calendar/shared/:ownerId" element={<SharedCalendarPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="me" element={<ProfilePage />} />
        <Route path="me/friends" element={<FriendsPage />} />
        <Route path="me/organizer" element={<OrganizerPage />} />
        <Route path="me/location" element={<LocationSharingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
