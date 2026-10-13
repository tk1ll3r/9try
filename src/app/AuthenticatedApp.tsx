import { lazy, Suspense } from "react";
import { useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "../kernel/auth";
import { isInstalled } from "../kernel/install";
import { isPlainPath } from "../kernel/module";
import { AuthPage } from "../modules/identity/presentation/AuthPage";
import { t } from "../kernel/i18n";

// The sign-in screen does not need the modules, so they are downloaded after sign-in.
const SignedInApp = lazy(() => import("./SignedInApp"));
// The page that says what the app is. Someone who comes back signed in never downloads it.
const LandingPage = lazy(() => import("./landing/LandingPage"));

export default function AuthenticatedApp() { return <AuthProvider><AppRoutes /></AuthProvider>; }
function AppRoutes() {
  const { user, loading, failed } = useAuth();
  const { pathname, state } = useLocation();
  const waiting = <div role="status" className="grid min-h-dvh place-items-center">{t("Đang kiểm tra đăng nhập…")}</div>;
  if (loading) return waiting;
  if (!user) {
    // The path goes into the emailed link, so only a plain in-app path is passed on. Whether it is a real
    // route is checked after sign-in, when the modules are loaded. The landing page hands on the path it
    // was shown at when its sign-in button is pressed.
    const from = pathname === "/login" ? (state as { from?: unknown } | null)?.from : pathname;
    const returnPath = typeof from === "string" && from !== "/login" && isPlainPath(from) ? from : "/";
    // A visitor is first told what the app is, whatever address brought them: an invitation's link is
    // where a newcomer most often arrives. Sign-in is one press away, at /login. Whoever opens the
    // installed app, or comes back from a sign-in that did not work, already knows the app and goes
    // straight to sign-in, where the failure is explained.
    if (pathname !== "/login" && !isInstalled() && !failed) return <Suspense fallback={waiting}><LandingPage /></Suspense>;
    return <AuthPage returnPath={returnPath} />;
  }
  return <Suspense fallback={waiting}><SignedInApp userId={user.id} /></Suspense>;
}
