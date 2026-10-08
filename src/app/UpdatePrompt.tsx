import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../kernel/ui/Button";
import { t } from "../kernel/i18n";

/** Registers the service worker and offers the new version once one has been downloaded. */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  if (!needRefresh) return null;
  return <div role="status" className="animate-slide-up fixed inset-x-3 bottom-24 z-50 flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--ink)] shadow-2xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96">
    {t("Có bản mới của ứng dụng.")}
    <Button variant="secondary" onClick={() => void updateServiceWorker(true)}>{t("Cập nhật")}</Button>
  </div>;
}
