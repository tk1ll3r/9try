import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { friendsModule } from "../friends.module";
import { friendsKey, useFriendConnections } from "./useFriends";
import { t } from "../../../kernel/i18n";

/** Today's card: friend requests waiting for an answer, answered in place. */
export function FriendRequestsCard() {
  const friends = useModule(friendsModule);
  const incoming = (useFriendConnections().data ?? []).filter(item => item.status === "pending" && item.direction === "incoming");
  const { run, pending, error } = useAction(friendsKey);
  if (!incoming.length) return null;

  return <Card title={t("Lời mời kết bạn · {0}", incoming.length)} action={<Link to="/me/friends" className="card-link">{t("Bạn bè")}</Link>}>
    <ul className="space-y-2">
      {incoming.map(item => <li key={item.userId} className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--soft)] p-3">
        <span className="min-w-32 flex-1">
          <b className="block truncate">{item.displayName}</b>
          {item.username && <span className="text-xs text-[var(--muted)]">@{item.username}</span>}
        </span>
        <Button className="px-3" disabled={pending} aria-label={t("Chấp nhận {0}", item.displayName)} onClick={() => run(() => friends.respond(item.userId, true))}><Check size={16} /> {t("Chấp nhận")}</Button>
        <Button variant="ghost" className="px-3" disabled={pending} aria-label={t("Từ chối {0}", item.displayName)} onClick={() => run(() => friends.respond(item.userId, false))}>{t("Từ chối")}</Button>
      </li>)}
    </ul>
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
