import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { StatTile } from "../../../kernel/ui/Stat";
import { meetupStats } from "../domain/Meetup";
import { meetupsModule } from "../meetups.module";
import { meetupsKey } from "./labels";
import { t } from "../../../kernel/i18n";

/** The statistics card of meetups: how many the user went to in the days counted, how many are coming, how many wait for an answer. */
export function MeetupStatsCard({ days }: { days: number }) {
  const meetups = useModule(meetupsModule);
  const userId = useUserId();
  const list = useQuery({ queryKey: [...meetupsKey, "list"], queryFn: () => meetups.list() });
  const stats = meetupStats(list.data ?? [], userId, days);
  return <Card title={t("Hoạt động")} action={<Link to="/meetups" className="card-link">{t("Mở hoạt động")}</Link>}>
    {list.isError ? <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(list.error, t("Không thể tải hoạt động."))}</p>
      : <div className="grid grid-cols-3 gap-2">
        <StatTile value={stats.went} label={t("buổi đã diễn ra")} />
        <StatTile value={stats.coming} label={t("buổi sắp tới")} />
        <StatTile value={stats.waiting} label={t("lời mời chờ bạn")} />
      </div>}
  </Card>;
}
