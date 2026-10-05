import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import themePlugin from "@fullcalendar/react/themes/monarch";
import viLocale from "@fullcalendar/react/locales/vi";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { appData } from "../../../shared/infrastructure/AppData";
import { Card } from "../../../shared/ui/Card";
import { Button } from "../../../shared/ui/Button";

export function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  async function refresh() {
    if (!user) return;
    setEvents((await appData.home(user.id)).events);
  }

  useEffect(() => { void refresh(); }, [user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    await appData.createEvent(user.id, title, new Date(start).toISOString(), new Date(end).toISOString());
    setTitle("");
    setStart("");
    setEnd("");
    await refresh();
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư mặc định</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Lịch</h1>
      </header>
      <Card title="Thêm sự kiện cá nhân">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-4">
          <input className="field" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tên sự kiện" />
          <input className="field" type="datetime-local" required value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="field" type="datetime-local" required value={end} onChange={(e) => setEnd(e.target.value)} />
          <Button type="submit">Lưu</Button>
        </form>
      </Card>
      <Card>
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={viLocale}
          firstDay={1}
          height="auto"
          events={events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start_at ?? event.all_day_start,
            allDay: !event.start_at,
          }))}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
          buttonText={{ today: "Hôm nay", month: "Tháng", week: "Tuần" }}
        />
      </Card>
    </div>
  );
}
