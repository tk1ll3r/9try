import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { calendarModule } from "../calendar.module";
import { feedKey } from "./CalendarFeedCard";
import { t } from "../../../kernel/i18n";

export function CalendarPrivacy() {
  const calendar = useModule(calendarModule);
  const shared = useQuery({ queryKey: ["calendar", "shared-count"], queryFn: async () => (await calendar.listEvents()).filter(event => event.visibility !== "only_me").length });
  // A database without the feed table simply has no feed.
  const feed = useQuery({ queryKey: feedKey, queryFn: () => calendar.feedCreatedAt().catch(() => null) });
  const { run, pending, error } = useAction(feedKey);

  return <Card title={t("Sự kiện trong lịch")} action={<Link to="/calendar" className="text-sm font-semibold underline">{t("Mở Lịch")}</Link>}>
    <p className="text-sm leading-6 text-[var(--muted)]">{shared.isError ? t("Chưa tải được lịch của bạn.")
      : shared.data ? <span className="text-[var(--ink)]">{t("{0} sự kiện đang hiện cho những người bạn bạn đã chọn, kèm tên sự kiện. Mở từng sự kiện trong Lịch để đổi về “Chỉ mình tôi”.", shared.data)}</span>
      : t("Mọi sự kiện của bạn đang ở chế độ “Chỉ mình tôi”.")}</p>
    {feed.data && <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-6">{t("Một liên kết lịch đang hoạt động. Ai có liên kết đó đều đọc được toàn bộ lịch của bạn.")}</p>
      <Button variant="danger" disabled={pending} onClick={() => run(() => calendar.revokeFeed())}>{t("Thu hồi liên kết")}</Button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
