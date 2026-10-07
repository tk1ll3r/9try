import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { calendarModule } from "../calendar.module";
import { formatOccurrence, selectUpcoming } from "../domain/upcoming";

/** Today's card with the next six events of the coming 30 days. */
export function UpcomingCard() {
  const calendar = useModule(calendarModule);
  const upcoming = useQuery({
    queryKey: ["calendar", "upcoming"],
    queryFn: async () => {
      const now = new Date();
      return selectUpcoming(await calendar.listOccurrences(now, new Date(now.getTime() + 30 * 86_400_000)), now).slice(0, 6);
    },
  });
  return (
    <Card title="Sắp tới" action={<Link className="text-sm font-semibold underline" to="/calendar">Mở lịch</Link>}>
      {upcoming.data?.length ? upcoming.data.map(event => <div key={event.id} className="mb-2 rounded-2xl bg-[var(--soft)] p-4"><b>{event.title}</b><p className="text-sm text-[var(--muted)]">{formatOccurrence(event)}</p></div>)
        : <div className="py-10 text-center text-[var(--muted)]"><CalendarClock className="mx-auto mb-2" />{upcoming.isPending ? "Đang tải lịch…" : upcoming.isError ? "Chưa tải được lịch." : "Chưa có sự kiện trong 30 ngày tới"}</div>}
    </Card>
  );
}
