import { MapPinOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { locationModule } from "../location.module";
import { locale, t } from "../../../kernel/i18n";

export function LocationPrivacy() {
  const { sharing } = useModule(locationModule);
  const state = useSyncExternalStore(sharing.subscribe, sharing.getState);

  return <Card title={t("Vị trí")} action={<Link to="/me/location" className="text-sm font-semibold underline">{t("Mở bản đồ")}</Link>}>
    {state.sessions.length ? <div className="space-y-2">{state.sessions.map(session => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-6">{t("Những người bạn bạn đã chọn thấy vị trí {0}của bạn tới {1}.", session.approximate ? t("gần đúng ") : "", new Date(session.expires_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }))}</p>
      <Button variant="danger" disabled={state.pending} onClick={() => void sharing.stop(session.id)}><MapPinOff size={16} /> {t("Dừng chia sẻ")}</Button>
    </div>)}</div>
      : <p className="text-sm leading-6 text-[var(--muted)]">{state.loading ? t("Đang kiểm tra…") : t("Bạn không chia sẻ vị trí với ai. Vị trí chỉ được gửi trong một phiên có thời hạn do bạn bật.")}</p>}
    {state.error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{state.error}</p>}
  </Card>;
}
