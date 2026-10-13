import { Download, Share, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { installOffer, isInstalled, isIos } from "../../../kernel/install";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { t } from "../../../kernel/i18n";

const dismissedKey = "gnouht-install-hint-dismissed";

/** Today's card: how to put the app on the home screen. It stays away once installed or dismissed on this device. */
export function InstallCard() {
  const available = useSyncExternalStore(installOffer.subscribe, installOffer.available);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(dismissedKey) === "1"; } catch { return false; } });
  const ios = isIos();
  if (dismissed || isInstalled() || (!available && !ios)) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(dismissedKey, "1"); } catch { /* Storage may be blocked; the card then comes back next time. */ }
  }

  return <Card title={t("Cài ứng dụng lên màn hình chính")} action={<button type="button" aria-label={t("Ẩn gợi ý cài đặt")} onClick={dismiss} className="grid size-11 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--soft)]"><X size={18} /></button>}>
    <p className="text-sm leading-6 text-[var(--muted)]">{t("Mở nhanh từ màn hình chính và chạy toàn màn hình như một ứng dụng.{0}", ios ? t(" Trên iPhone và iPad, thông báo đẩy chỉ tới khi ứng dụng đã được cài.") : "")}</p>
    {ios && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("Khi mở Gnouht từ màn hình chính, bạn có thể chụp khoảnh khắc và đổi mode ngay trên trang Mode.")}</p>}
    {available ? <Button className="mt-3" variant="secondary" onClick={() => void installOffer.accept()}><Download size={17} /> {t("Cài đặt")}</Button>
      : <p className="mt-3 flex items-start gap-2 text-sm leading-6"><Share size={17} className="mt-1 shrink-0" /> {t("Mở trang này bằng Safari, chạm nút Chia sẻ, rồi chọn “Thêm vào Màn hình chính”.")}</p>}
  </Card>;
}
