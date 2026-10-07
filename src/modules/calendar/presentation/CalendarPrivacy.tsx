import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { calendarModule } from "../calendar.module";

export function CalendarPrivacy() {
  const calendar = useModule(calendarModule);
  const shared = useQuery({ queryKey: ["calendar", "shared-count"], queryFn: async () => (await calendar.listEvents()).filter(event => event.visibility !== "only_me").length });

  return <Card title="Sự kiện trong lịch" action={<Link to="/calendar" className="text-sm font-semibold underline">Mở Lịch</Link>}>
    <p className="text-sm leading-6 text-[var(--muted)]">{shared.isError ? "Chưa tải được lịch của bạn."
      : shared.data ? <span className="text-[var(--ink)]">{shared.data} sự kiện đang hiện cho những người bạn bạn đã chọn, kèm tên sự kiện. Mở từng sự kiện trong Lịch để đổi về “Chỉ mình tôi”.</span>
      : "Mọi sự kiện của bạn đang ở chế độ “Chỉ mình tôi”."}</p>
  </Card>;
}
