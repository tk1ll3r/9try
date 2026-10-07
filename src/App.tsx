import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

const AuthenticatedApp = lazy(() => import("./app/AuthenticatedApp"));
const LocationDemoPage = lazy(() => import("./features/demo/presentation/LocationDemoPage").then(m => ({ default: m.LocationDemoPage })));
const demoEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true";

export default function App() {
  return <BrowserRouter><Suspense fallback={<div role="status" className="grid min-h-dvh place-items-center">Đang tải…</div>}>
    <Routes>
      {demoEnabled && <Route path="/demo/location" element={<LocationDemoPage />} />}
      <Route path="/*" element={<AuthenticatedApp />} />
    </Routes>
  </Suspense></BrowserRouter>;
}
