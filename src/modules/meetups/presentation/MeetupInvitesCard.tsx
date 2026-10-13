import { useQuery } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { MeetupPolicy } from "../domain/Meetup";
import { meetupsModule } from "../meetups.module";
import { meetupsKey } from "./labels";
import { locale, t } from "../../../kernel/i18n";

/** Today's card: meetups the user is invited to and has not answered yet, answered in place. */
export function MeetupInvitesCard() {
  const meetups = useModule(meetupsModule);
  const userId = useUserId();
  const list = useQuery({ queryKey: [...meetupsKey, "list"], queryFn: () => meetups.list() });
  const { run, pending, error } = useAction(meetupsKey);
  const waiting = (list.data ?? []).filter(item => item.rsvp === "pending" && new MeetupPolicy(item, userId).canRespond);
  if (!waiting.length) return null;

  return <Card title={t("Lời mời hoạt động · {0}", waiting.length)} action={<Link to="/meetups" className="card-link">{t("Hoạt động")}</Link>}>
    <ul className="space-y-2">
      {waiting.map(item => <li key={item.id} className="rounded-2xl bg-[var(--soft)] p-3">
        <Link to={`/meetups/${item.id}`} className="block break-words font-bold hover:underline">{item.title}</Link>
        <p className="text-xs text-[var(--muted)]">{item.startAt ? new Date(item.startAt).toLocaleString(locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : t("Chưa chốt giờ")}{item.locationName ? ` · ${item.locationName}` : ""}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button className="px-3" disabled={pending} aria-label={t("Đi: {0}", item.title)} onClick={() => run(() => meetups.respond(item.id, "going"))}><Check size={16} /> {t("Đi")}</Button>
          <Button variant="ghost" className="px-3" disabled={pending} aria-label={t("Có thể: {0}", item.title)} onClick={() => run(() => meetups.respond(item.id, "maybe"))}>{t("Có thể")}</Button>
          <Button variant="ghost" className="px-3" disabled={pending} aria-label={t("Không đi: {0}", item.title)} onClick={() => run(() => meetups.respond(item.id, "declined"))}><X size={16} /> {t("Không")}</Button>
        </div>
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
