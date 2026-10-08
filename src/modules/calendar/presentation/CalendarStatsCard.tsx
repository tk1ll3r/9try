import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { lastDays } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useAgenda, useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { BarChart, dayBars, StatTile } from "../../../kernel/ui/Stat";
import { calendarModule } from "../calendar.module";
import { entryOf, entryOfAgenda, scheduledMinutes, shiftDays, startOfDay } from "../domain/calendarView";
import { calendarKey } from "./keys";
import { locale, t } from "../../../kernel/i18n";

/** Hours to one decimal, the way the device's region writes numbers: "12,5". */
const hours = (minutes: number) => (Math.round(minutes / 6) / 10).toLocaleString(locale);

/** The statistics card of the calendar: the hours that had a class, an event or a plan with others on them, day by day. */
export function CalendarStatsCard({ days }: { days: number }) {
  const calendar = useModule(calendarModule);
  const loadAgenda = useAgenda();
  const window = lastDays(days);
  const shown = useQuery({
    queryKey: [...calendarKey, "stats", window[0], days],
    queryFn: async () => {
      const from = startOfDay(window[0]), until = startOfDay(shiftDays(window[window.length - 1], 1));
      const [events, agenda] = await Promise.all([calendar.listOccurrences(from, until), loadAgenda(from, until)]);
      return scheduledMinutes([...events.map(entryOf), ...agenda.map(entryOfAgenda)], window);
    },
  });
  const perDay = new Map((shown.data ?? []).map(item => [item.day, item]));
  const total = (tone: "class" | "event" | "activity") => (shown.data ?? []).reduce((sum, item) => sum + item[tone], 0);
  return <Card title={t("Lịch")} action={<Link to="/calendar" className="text-sm font-semibold underline">{t("Mở lịch")}</Link>}>
    {shown.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(shown.error, t("Chưa tải được lịch."))}</p> : <>
      <div className="grid grid-cols-3 gap-2">
        <StatTile value={hours(total("class"))} label={t("giờ học")} />
        <StatTile value={hours(total("event"))} label={t("giờ sự kiện")} />
        <StatTile value={hours(total("activity"))} label={t("giờ hoạt động")} />
      </div>
      <p className="mb-2 mt-4 text-xs font-bold text-[var(--muted)]">{t("Giờ có lịch mỗi ngày")}</p>
      <BarChart label={t("Giờ có lịch mỗi ngày")} bars={dayBars(window, day => {
        const item = perDay.get(day);
        return [{ value: item?.class ?? 0, color: "var(--tone-class)" }, { value: item?.event ?? 0, color: "var(--tone-event)" }, { value: item?.activity ?? 0, color: "var(--tone-activity)" }];
      }, day => {
        const item = perDay.get(day);
        return t("{0} giờ có lịch", hours((item?.class ?? 0) + (item?.event ?? 0) + (item?.activity ?? 0)));
      })} />
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        {([["class", t("Lớp học")], ["event", t("Sự kiện")], ["activity", t("Hoạt động")]] as const).map(([tone, name]) =>
          <span key={tone} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: `var(--tone-${tone})` }} />{name}</span>)}
      </p>
    </>}
  </Card>;
}
