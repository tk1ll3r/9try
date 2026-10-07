import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AuthPage } from "../features/auth/presentation/AuthPage";
import { AppShell } from "../shared/ui/AppShell";
import { returnPathKey, safeReturnPath } from "../features/auth/domain/login";

const HomePage = lazy(() => import("../features/home/presentation/HomePage").then(m => ({ default: m.HomePage })));
const CalendarPage = lazy(() => import("../features/calendars/presentation/CalendarPage").then(m => ({ default: m.CalendarPage })));
const SharedCalendarPage = lazy(() => import("../features/calendars/presentation/SharedCalendarPage").then(m => ({ default: m.SharedCalendarPage })));
const FriendsPage = lazy(() => import("../features/friends/presentation/FriendsPage").then(m => ({ default: m.FriendsPage })));
const GroupInvitePage = lazy(() => import("../features/groups/presentation/GroupInvitePage").then(m => ({ default: m.GroupInvitePage })));
const GroupsPage = lazy(() => import("../features/groups/presentation/GroupsPage").then(m => ({ default: m.GroupsPage })));
const GroupManagePage = lazy(() => import("../features/groups/presentation/GroupManagePage").then(m => ({ default: m.GroupManagePage })));
const LocationSharingPage = lazy(() => import("../features/location-sharing/presentation/LocationSharingPage").then(m => ({ default: m.LocationSharingPage })));
const MeetupsPage = lazy(() => import("../features/meetups/presentation/MeetupsPage").then(m => ({ default: m.MeetupsPage })));
const NotificationsPage = lazy(() => import("../features/notifications/presentation/NotificationsPage").then(m => ({ default: m.NotificationsPage })));
const OrganizerPage = lazy(() => import("../features/personal/presentation/OrganizerPage").then(m => ({ default: m.OrganizerPage })));
const ProfilePage = lazy(() => import("../features/personal/presentation/ProfilePage").then(m => ({ default: m.ProfilePage })));

export default function AuthenticatedApp() { return <AuthProvider><AppRoutes /></AuthProvider>; }
function AppRoutes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!user) return;
    try {
      const saved = sessionStorage.getItem(returnPathKey);
      sessionStorage.removeItem(returnPathKey);
      if (saved && safeReturnPath(saved) !== "/") navigate(safeReturnPath(saved), { replace: true });
    } catch { /* Browser privacy settings may disallow storage. */ }
  }, [user?.id, navigate]);
  if (loading) return <div role="status" className="grid min-h-dvh place-items-center">Đang kiểm tra đăng nhập…</div>;
  if (!user) return <AuthPage />;
  return <Suspense fallback={<div role="status" className="p-6">Đang tải trang…</div>}>
    <Routes><Route element={<AppShell />}>
      <Route index element={<HomePage />} /><Route path="groups" element={<GroupsPage />} />
      <Route path="groups/:groupId" element={<GroupManagePage />} /><Route path="invite/group/:token" element={<GroupInvitePage />} />
      <Route path="meetups" element={<MeetupsPage />} /><Route path="calendar" element={<CalendarPage />} />
      <Route path="calendar/shared/:ownerId" element={<SharedCalendarPage />} /><Route path="notifications" element={<NotificationsPage />} />
      <Route path="me" element={<ProfilePage />} /><Route path="me/friends" element={<FriendsPage />} />
      <Route path="me/organizer" element={<OrganizerPage />} /><Route path="me/location" element={<LocationSharingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route></Routes>
  </Suspense>;
}
