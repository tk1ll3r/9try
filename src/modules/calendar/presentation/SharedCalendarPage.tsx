import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import { entryOf, startOfDay, type CalendarEntry } from "../domain/calendarView";
import { CalendarBoard } from "./CalendarBoard";
import { calendarKey } from "./keys";

/** A friend's calendar, as far as they share it: the events they chose to show, and when they are busy. */
export function SharedCalendarPage() {
  const { ownerId = "" } = useParams();
  const calendar = useModule(calendarModule);
  const [day, setDay] = useState(() => localDateKey(new Date()));
  const [range, setRange] = useState<[from: string, until: string]>();
  const [name, setName] = useState("Lịch được chia sẻ");

  const shown = useQuery({
    queryKey: [...calendarKey, "shared", ownerId, ...(range ?? [])],
    enabled: !!range && !!ownerId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, until] = range!.map(startOfDay);
      // Busy times come from a separate permission. `null` means this person does not share them.
      const [events, busy] = await Promise.all([calendar.listSharedOccurrences(ownerId, from, until), calendar.busyFor(ownerId, from, until).catch(() => null)]);
      const entries: CalendarEntry[] = [
        ...events.map(event => ({ ...entryOf(event), audience: undefined })),
        // A shared event is also a busy time; it is shown once, with its title.
        ...(busy ?? []).filter(time => !events.some(event => event.id === time.id)).map(time => ({ id: `busy:${time.id}`, title: "Bận", allDay: time.allDay, start: time.start, end: time.end, tone: "busy" as const })),
      ];
      return { entries, sharesBusy: busy !== null, owner: events[0]?.ownerDisplayName };
    },
  });
  // The name comes with the events, so it is kept while a week without events is on screen.
  useEffect(() => { if (shown.data?.owner) setName(shown.data.owner); }, [shown.data?.owner]);

  return <div className="space-y-5">
    <header>
      <Link to="/me/friends" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft size={16} /> Quay lại bạn bè</Link>
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><Eye size={16} /> Lịch bạn bè chia sẻ với bạn</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{name}</h1>
    </header>

    {shown.isError && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{errorMessage(shown.error, "Chưa tải được lịch được chia sẻ.")}</div>}
    <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">
      Bạn chỉ thấy những sự kiện người này chọn chia sẻ; địa điểm và ghi chú riêng của họ không được gửi tới máy bạn. {shown.data && (shown.data.sharesBusy
        ? "Ô “Bận” là lúc người này có việc, không kèm tên việc."
        : "Người này chưa chia sẻ lúc bận với bạn, nên khoảng trống không có nghĩa là họ rảnh.")}
    </p>

    <CalendarBoard entries={shown.data?.entries ?? []} day={day} onDay={setDay} onRange={(from, until) => setRange([from, until])} />
  </div>;
}
