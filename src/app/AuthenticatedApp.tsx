import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "../kernel/auth";
import { RealtimeBridge } from "../kernel/realtime";
import { SessionProvider } from "../kernel/session";
import { returnPathKey } from "../modules/identity/domain/login";
import { AuthPage } from "../modules/identity/presentation/AuthPage";
import { AppShell } from "./AppShell";
import { registry } from "./modules";

export default function AuthenticatedApp() { return <AuthProvider><AppRoutes /></AuthProvider>; }
function AppRoutes() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (!user) return;
    try {
      const saved = sessionStorage.getItem(returnPathKey);
      sessionStorage.removeItem(returnPathKey);
      if (saved && registry.safePath(saved) !== "/") navigate(registry.safePath(saved), { replace: true });
    } catch { /* Browser privacy settings may disallow storage. */ }
  }, [user?.id, navigate]);
  if (loading) return <div role="status" className="grid min-h-dvh place-items-center">Đang kiểm tra đăng nhập…</div>;
  if (!user) return <AuthPage returnPath={registry.safePath(pathname)} />;
  // The key gives each account its own services and query cache.
  return <SessionProvider key={user.id} userId={user.id} registry={registry}>
    <RealtimeBridge userId={user.id} />
    <Suspense fallback={<div role="status" className="p-6">Đang tải trang…</div>}>
      <Routes><Route element={<AppShell />}>
        {registry.routes.map(({ path, component: Page }) => path
          ? <Route key={path} path={path} element={<Page />} />
          : <Route key="home" index element={<Page />} />)}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route></Routes>
    </Suspense>
  </SessionProvider>;
}
