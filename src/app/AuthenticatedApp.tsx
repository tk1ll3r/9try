import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../kernel/auth";
import { isPlainPath } from "../kernel/module";
import { AuthPage } from "../modules/identity/presentation/AuthPage";
import { t } from "../kernel/i18n";

// The sign-in screen does not need the modules, so they are downloaded after sign-in.
const SignedInApp = lazy(() => import("./SignedInApp"));

export default function AuthenticatedApp() { return <AuthProvider><AppRoutes /></AuthProvider>; }
function AppRoutes() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const waiting = <div role="status" className="grid min-h-dvh place-items-center">{t("Đang kiểm tra đăng nhập…")}</div>;
  if (loading) return waiting;
  // The path goes into the emailed link, so only a plain in-app path is passed on. Whether it is a real
  // route is checked after sign-in, when the modules are loaded.
  if (!user) return <AuthPage returnPath={isPlainPath(pathname) ? pathname : "/"} />;
  return <Suspense fallback={waiting}><SignedInApp userId={user.id} /></Suspense>;
}
