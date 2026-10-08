import { useQuery } from "@tanstack/react-query";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { presenceModule } from "../presence.module";
import { choiceOf, presenceKey } from "./modes";
import { locale, t } from "../../../kernel/i18n";

export function PresencePrivacy() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list() });
  const { run, pending, error } = useAction(presenceKey);
  const mine = list.data?.find(item => item.userId === userId && Date.parse(item.expiresAt) > Date.now());
  const label = choiceOf(mine?.mode)?.label;

  return <Card title={t("Mode của bạn")}>
    {mine ? <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-6">{t("Mọi bạn bè của bạn thấy mode “{0}” tới {1}.", label, new Date(mine.expiresAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }))}</p>
      <Button variant="danger" disabled={pending} onClick={() => run(() => presence.set(null, 0))}>{t("Tắt mode")}</Button>
    </div> : <p className="text-sm leading-6 text-[var(--muted)]">{list.isError ? t("Chưa tải được mode của bạn.") : t("Bạn không bật mode nào. Mode do bạn tự chọn và tự tắt khi hết hạn.")}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
