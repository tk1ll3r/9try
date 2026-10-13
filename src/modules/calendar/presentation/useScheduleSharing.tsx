import { useQuery } from "@tanstack/react-query";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import type { ScheduleGrant, ScheduleRequest } from "../domain/ScheduleSharing";
import { calendarKey } from "./keys";
import { t } from "../../../kernel/i18n";

const none: never[] = [];

/**
 * The questions about schedules and the permissions that hold, for the signed-in user. Under
 * "calendar", so the server's "calendar" event reloads it when someone asks, answers or takes a
 * permission back.
 */
export function useScheduleSharing(): { requests: ScheduleRequest[]; grants: ScheduleGrant[]; problem: unknown } {
  const calendar = useModule(calendarModule);
  const sharing = useQuery({
    queryKey: [...calendarKey, "sharing"],
    queryFn: async () => { const [requests, grants] = await Promise.all([calendar.scheduleRequests(), calendar.scheduleGrants()]); return { requests, grants }; },
    staleTime: 30_000,
  });
  return { requests: sharing.data?.requests ?? none, grants: sharing.data?.grants ?? none, problem: sharing.isError ? sharing.error : undefined };
}

/** How many friends wait for an answer, shown on the calendar's entries in the navigation. Renders nothing when nobody does. */
export function ScheduleBadge() {
  const count = useScheduleSharing().requests.filter(item => item.direction === "incoming" && item.status === "pending").length;
  if (!count) return null;
  return <span aria-label={t("{0} yêu cầu xem lịch đang chờ", count)} className="absolute -right-2 -top-1.5 grid min-w-4.5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4.5 text-white">{count > 9 ? "9+" : count}</span>;
}
