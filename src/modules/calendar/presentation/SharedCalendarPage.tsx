import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { useAcceptedFriends } from "../../friends";
import { calendarModule } from "../calendar.module";
import { entryOf, startOfDay, type CalendarEntry } from "../domain/calendarView";
import { entryOfGranted, grantSummary } from "../domain/ScheduleSharing";
import { CalendarBoard } from "./CalendarBoard";
import { calendarKey } from "./keys";
import { useScheduleSharing } from "./useScheduleSharing";
import { t } from "../../../kernel/i18n";

/**
 * A friend's calendar, as far as they share it. Three things can be on it: the events they chose to
 * show, their busy times when they share those, and what a permission they gave on request lets
 * this person see. Without a permission, this is where to ask for one.
 */
export function SharedCalendarPage() {
  const { ownerId = "" } = useParams();
  const calendar = useModule(calendarModule);
  const friend = useAcceptedFriends().find(item => item.userId === ownerId);
  const { requests, grants } = useScheduleSharing();
  const asking = useAction(calendarKey);
  const [day, setDay] = useState(() => localDateKey(new Date()));
  const [range, setRange] = useState<[from: string, until: string]>();
  const [name, setName] = useState(t("Lịch được chia sẻ"));

  const grant = grants.find(item => item.direction === "received" && item.userId === ownerId);
  const open = requests.find(item => item.direction === "outgoing" && item.userId === ownerId && item.status === "pending");

  const shown = useQuery({
    // The permission is part of the key: when it is given, changed or taken back, the days are read again.
    queryKey: [...calendarKey, "shared", ownerId, ...(range ?? []), grant?.expiresAt ?? "", grant?.detail ?? ""],
    enabled: !!range && !!ownerId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, until] = range!.map(startOfDay);
      // Each of the three comes from a permission of its own. `null` means this person does not give it.
      const [events, busy, granted] = await Promise.all([
        calendar.listSharedOccurrences(ownerId, from, until),
        calendar.busyFor(ownerId, from, until).catch(() => null),
        calendar.grantedSchedule(ownerId, from, until).catch(() => null),
      ]);
      // One thing is drawn once: with its name when an event was shown, else as the permission shows it, else as "busy".
      const allowed = (granted ?? []).filter(item => !events.some(event => event.eventId === item.eventId));
      const sameTime = (item: { eventId: string; start: string }) => allowed.some(other => other.eventId === item.eventId && new Date(other.start).getTime() === new Date(item.start).getTime());
      const entries: CalendarEntry[] = [
        ...events.map(event => ({ ...entryOf(event), audience: undefined })),
        ...allowed.map(entryOfGranted),
        ...(busy ?? []).filter(time => !events.some(event => event.id === time.id) && !sameTime(time))
          .map(time => ({ id: `busy:${time.id}`, title: t("Bận"), allDay: time.allDay, start: time.start, end: time.end, tone: "busy" as const })),
      ];
      return { entries, sharesBusy: busy !== null, owner: events[0]?.ownerDisplayName };
    },
  });
  // The name comes with the friend list, or with the events of someone who is not a friend.
  useEffect(() => { const known = friend?.displayName ?? shown.data?.owner; if (known) setName(known); }, [friend?.displayName, shown.data?.owner]);

  return <div className="space-y-5">
    <header>
      <Link to="/me/friends" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft size={16} /> {t("Quay lại bạn bè")}</Link>
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><Eye size={16} /> {t("Lịch bạn bè chia sẻ với bạn")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{name}</h1>
    </header>

    {shown.isError && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{errorMessage(shown.error, t("Chưa tải được lịch được chia sẻ."))}</div>}

    {/* What this person may see on request, or the way to ask. Only a friend can be asked. */}
    {friend && <section aria-label={t("Quyền xem lịch")} className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6">
      {grant ? <p className="min-w-0 flex-1"><b>{t("{0} cho bạn xem lịch.", name)}</b> {grantSummary(grant)}</p>
        : open ? <>
          <p className="min-w-0 flex-1">{t("Bạn đã hỏi xem lịch của {0}. Đang chờ trả lời.", name)}</p>
          <Button variant="ghost" disabled={asking.pending} onClick={() => asking.run(() => calendar.cancelScheduleRequest(open.id))}>{t("Rút lại")}</Button>
        </> : <>
          <p className="min-w-0 flex-1">{t("Muốn biết {0} bận lúc nào? Hãy hỏi. Họ chọn cho bạn xem lúc bận, cả tên sự kiện, hoặc từ chối.", name)}</p>
          <Button variant="secondary" disabled={asking.pending} onClick={() => asking.run(() => calendar.requestSchedule(ownerId, ""))}><Send size={16} /> {t("Xin xem lịch")}</Button>
        </>}
      {asking.error && <p role="alert" className="w-full text-[var(--danger)]">{asking.error}</p>}
    </section>}

    <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
      {t("Bạn chỉ thấy những sự kiện người này chọn chia sẻ; địa điểm và ghi chú riêng của họ không được gửi tới máy bạn.")} {shown.data && (shown.data.sharesBusy || grant
        ? t("Ô “Bận” là lúc người này có việc, không kèm tên việc.")
        : t("Người này chưa chia sẻ lúc bận với bạn, nên khoảng trống không có nghĩa là họ rảnh."))}
    </p>

    <CalendarBoard entries={shown.data?.entries ?? []} day={day} onDay={setDay} onRange={(from, until) => setRange([from, until])} />
  </div>;
}
