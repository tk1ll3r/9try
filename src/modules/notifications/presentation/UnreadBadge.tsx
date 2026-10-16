import { useQuery } from "@tanstack/react-query";
import { missedEventMs } from "../../../kernel/realtime";
import { useModule } from "../../../kernel/session";
import { notificationsModule } from "../notifications.module";
import { t } from "../../../kernel/i18n";

export const unreadKey = ["notifications", "unread"] as const;

/** The number of unread notifications, shown on the bell. Renders nothing when there are none. */
export function UnreadBadge() {
  const { inbox } = useModule(notificationsModule);
  // The realtime "notifications" event reloads this at once. The timer only covers an event that was missed.
  const { data: count = 0 } = useQuery({ queryKey: unreadKey, queryFn: () => inbox.countUnread(), refetchInterval: missedEventMs, staleTime: missedEventMs });
  if (!count) return null;
  return <span key={count} aria-label={t("{0} thông báo chưa đọc", count)} className="animate-pop absolute -right-2 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4.5 text-white">{count > 9 ? "9+" : count}</span>;
}
