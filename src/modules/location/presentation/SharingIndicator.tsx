import { MapPinOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { locationModule } from "../location.module";
import { t } from "../../../kernel/i18n";

/** Shown on every screen while the user has an open sharing session, with a way to end it. */
export function SharingIndicator() {
  const { sharing } = useModule(locationModule);
  const state = useSyncExternalStore(sharing.subscribe, sharing.getState);
  const open = state.sessions.length > 0;
  useEffect(() => {
    const look = () => { if (document.visibilityState === "visible") void sharing.refresh(); };
    look();
    // An open session must be seen to end within half a minute. With none open, a session can only
    // have been started on another device: looking when the app comes back to the front finds it.
    const timer = window.setInterval(look, open ? 30_000 : 300_000);
    document.addEventListener("visibilitychange", look);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", look); };
  }, [sharing, open]);

  if (!open) return null;
  async function stopAll() {
    for (const session of state.sessions) await sharing.stop(session.id);
  }
  return (
    <div role="status" className="mb-4 flex items-center justify-between gap-2 rounded-2xl bg-[var(--lime)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">
      <Link to="/me/location" className="underline">{t("Đang chia sẻ vị trí")}</Link>
      <button type="button" disabled={state.pending} onClick={() => void stopAll()} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 hover:bg-black/10 disabled:opacity-50"><MapPinOff size={16} /> {t("Dừng chia sẻ")}</button>
    </div>
  );
}
