import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import themePlugin from "@fullcalendar/react/themes/monarch";
import viLocale from "@fullcalendar/react/locales/vi";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";
import { ArrowLeft, Eye } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import type { CalendarOccurrence, SharedCalendarOccurrence } from "../domain/Occurrence";
import { Card } from "../../../shared/ui/Card";

export function SharedCalendarPage() {
  const { ownerId = "" } = useParams();
  const calendar = useModule(calendarModule);
  const [events, setEvents] = useState<SharedCalendarOccurrence[]>([]);
  const [name, setName] = useState("Lịch được chia sẻ");
  const [message, setMessage] = useState("");

  // Busy times come from a separate permission. `null` means this person does not share them.
  const [busy, setBusy] = useState<CalendarOccurrence[] | null>([]);

  async function load(start: Date, end: Date) {
    if (!ownerId) return;
    try {
      const [next, nextBusy] = await Promise.all([
        calendar.listSharedOccurrences(ownerId, start, end),
        calendar.busyFor(ownerId, start, end).catch(() => null),
      ]);
      setEvents(next);
      // A shared event is also a busy time; show it once, with its title.
      setBusy(nextBusy && nextBusy.filter(time => !next.some(event => event.id === time.id)));
      if (next[0]) setName(next[0].ownerDisplayName);
      setMessage("");
    } catch (error) {
      setEvents([]);
      setBusy([]);
      setMessage(error instanceof Error ? error.message : "Không thể tải lịch được chia sẻ.");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/me/friends" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]">
          <ArrowLeft size={16} /> Quay lại bạn bè
        </Link>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><Eye size={16} /> Chỉ dữ liệu được phép chia sẻ</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{name}</h1>
      </header>

      <div className="rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]">
        Trang này chỉ nhận projection an toàn của sự kiện được chia sẻ. Địa chỉ chính xác và ghi chú riêng tư không được gửi tới trình duyệt của bạn.
      </div>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}
      <p className="text-sm text-[var(--muted)]">{busy === null
        ? "Người này chưa chia sẻ trạng thái bận/rảnh với bạn, nên chỉ có các sự kiện họ chia sẻ. Khoảng trống không có nghĩa là họ rảnh."
        : "Ô xám “Bận” là lúc người này có việc. Tên và địa điểm của những việc đó không được chia sẻ."}</p>

      <Card className="overflow-hidden p-3 sm:p-5">
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin]}
          initialView="dayGridMonth"
          locale={viLocale}
          firstDay={1}
          height="auto"
          events={[
            ...events.map((event) => ({ id: event.id, title: event.title, start: event.start, end: event.end, allDay: event.allDay })),
            ...(busy ?? []).map((time) => ({ id: `busy:${time.id}`, title: "Bận", start: time.start, end: time.end, allDay: time.allDay, color: "#9ca3af" })),
          ]}
          datesSet={(info) => void load(info.start, info.end)}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
        />
      </Card>
    </div>
  );
}
