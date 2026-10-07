import { Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { RealtimeBridge } from "../kernel/realtime";
import { SessionProvider } from "../kernel/session";
import { returnPathKey } from "../modules/identity/domain/login";
import { AppShell } from "./AppShell";
import { registry } from "./modules";

/** Everything behind sign-in: the modules, their routes and the shell. Loaded only once someone is signed in. */
export default function SignedInApp({ userId }: { userId: string }) {
  const navigate = useNavigate();
  // Go back to the page that asked for sign-in, if it is a route of the app.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(returnPathKey);
      sessionStorage.removeItem(returnPathKey);
      if (saved && registry.safePath(saved) !== "/") navigate(registry.safePath(saved), { replace: true });
    } catch { /* Browser privacy settings may disallow storage. */ }
  }, [userId, navigate]);

  // The key gives each account its own services and query cache.
  return <SessionProvider key={userId} userId={userId} registry={registry}>
    <RealtimeBridge userId={userId} />
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
