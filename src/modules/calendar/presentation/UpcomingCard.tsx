import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAgenda, useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { calendarModule } from "../calendar.module";
import { upcomingEntries } from "../domain/upcoming";
import { t } from "../../../kernel/i18n";

/** Today's card: the next six things of the coming 30 days, from the calendar and from what other modules put on it. */
export function UpcomingCard() {
  const calendar = useModule(calendarModule);
  const loadAgenda = useAgenda();
  const upcoming = useQuery({
    queryKey: ["calendar", "upcoming"],
    queryFn: async () => {
      const now = new Date(), until = new Date(now.getTime() + 30 * 86_400_000);
      const [events, agenda] = await Promise.all([calendar.listOccurrences(now, until), loadAgenda(now, until)]);
      return upcomingEntries(events, agenda, now);
    },
  });
  return (
    <Card title={t("Sắp tới")} action={<Link className="text-sm font-semibold underline" to="/calendar">{t("Mở lịch")}</Link>}>
      {upcoming.data?.length ? upcoming.data.map(entry => <Link key={entry.id} to={entry.to} className="mb-2 block rounded-2xl bg-[var(--soft)] p-4 hover:underline">
        <b>{entry.title}</b>{entry.kind && <span className="ml-2 rounded-full bg-[var(--lime)] px-2 py-0.5 text-xs font-bold text-[#1d230e]">{entry.kind}</span>}
        <p className="text-sm text-[var(--muted)]">{entry.when}</p>
      </Link>)
        : <div className="py-10 text-center text-[var(--muted)]"><CalendarClock className="mx-auto mb-2" />{upcoming.isPending ? t("Đang tải lịch…") : upcoming.isError ? t("Chưa tải được lịch.") : t("Chưa có sự kiện trong 30 ngày tới")}</div>}
    </Card>
  );
}
