import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import themePlugin from "@fullcalendar/react/themes/monarch";
import viLocale from "@fullcalendar/react/locales/vi";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";
import { CalendarPlus, Repeat2, Trash2, XCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { useAuth } from "../../../bootstrap/AuthProvider";
import {
  calendarData,
  type CalendarOccurrence,
  type RecurrenceRule,
} from "../infrastructure/CalendarData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

type EventKind = "timed" | "all_day";

export function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarOccurrence[]>([]);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [kind, setKind] = useState<EventKind>("timed");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [recurrence, setRecurrence] = useState<"" | RecurrenceRule>("");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [message, setMessage] = useState("");

  async function refresh(startDate = range?.start, endDate = range?.end) {
    if (!user || !startDate || !endDate) return;
    try {
      setEvents(await calendarData.listOccurrences(user.id, startDate, endDate));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải lịch.");
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user) return;

    if (kind === "timed" && new Date(end) <= new Date(start)) {
      setMessage("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    if (kind === "all_day" && end < start) {
      setMessage("Ngày cuối phải bằng hoặc sau ngày bắt đầu.");
      return;
    }
    if (recurrence && !recurrenceUntil) {
      setMessage("Sự kiện lặp cần ngày kết thúc chuỗi.");
      return;
    }

    try {
      await calendarData.create({
        userId: user.id,
        title,
        kind,
        start,
        end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        visibility: "only_me",
        recurrence: recurrence || null,
        recurrenceUntil: recurrenceUntil || null,
      });
      setTitle("");
      setStart("");
      setEnd("");
      setRecurrence("");
      setRecurrenceUntil("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo sự kiện.");
    }
  }

  function chooseOccurrence(id: string) {
    const occurrence = events.find((event) => event.id === id);
    if (!occurrence) return;

    setSelected(occurrence);
    setEditTitle(occurrence.title);
    if (occurrence.allDay) {
      setEditStart(occurrence.start);
      setEditEnd(Temporal.PlainDate.from(occurrence.end).subtract({ days: 1 }).toString());
    } else {
      setEditStart(toLocalDateTimeInput(occurrence.start));
      setEditEnd(toLocalDateTimeInput(occurrence.end));
    }
  }

  async function saveSelected(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;

    try {
      if (selected.recurring) {
        await calendarData.editOccurrence({
          eventId: selected.eventId,
          occurrenceDate: selected.occurrenceDate,
          title: editTitle,
          allDay: selected.allDay,
          start: editStart,
          end: editEnd,
        });
        setMessage("Đã sửa riêng occurrence này.");
      } else {
        await calendarData.updateWholeEvent({
          eventId: selected.eventId,
          title: editTitle,
          allDay: selected.allDay,
          start: editStart,
          end: editEnd,
        });
        setMessage("Đã cập nhật sự kiện.");
      }
      setSelected(null);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật sự kiện.");
    }
  }

  async function skipSelected() {
    if (!selected?.recurring) return;
    try {
      await calendarData.skipOccurrence(selected.eventId, selected.occurrenceDate);
      setSelected(null);
      setMessage("Đã bỏ riêng occurrence này khỏi chuỗi.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể bỏ occurrence.");
    }
  }

  async function deleteWholeSeries() {
    if (!selected) return;
    try {
      await calendarData.deleteWholeEvent(selected.eventId);
      setSelected(null);
      setMessage(selected.recurring ? "Đã xóa toàn bộ chuỗi." : "Đã xóa sự kiện.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xóa sự kiện.");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư mặc định · giữ đúng múi giờ</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Lịch</h1>
      </header>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title="Thêm sự kiện" action={<CalendarPlus size={18} className="text-[var(--muted)]" />}>
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input
            className="field md:col-span-2"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Tên sự kiện"
          />

          <select className="field" value={kind} onChange={(event) => {
            setKind(event.target.value as EventKind);
            setStart("");
            setEnd("");
          }}>
            <option value="timed">Có giờ cụ thể</option>
            <option value="all_day">Cả ngày</option>
          </select>

          <select className="field" value={recurrence} onChange={(event) => setRecurrence(event.target.value as "" | RecurrenceRule)}>
            <option value="">Không lặp</option>
            <option value="daily">Mỗi ngày</option>
            <option value="weekly">Mỗi tuần</option>
            <option value="monthly">Mỗi tháng</option>
          </select>

          <label>
            <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">{kind === "all_day" ? "Ngày bắt đầu" : "Bắt đầu"}</span>
            <input
              className="field w-full"
              type={kind === "all_day" ? "date" : "datetime-local"}
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>

          <label>
            <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">{kind === "all_day" ? "Ngày cuối" : "Kết thúc"}</span>
            <input
              className="field w-full"
              type={kind === "all_day" ? "date" : "datetime-local"}
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>

          {recurrence && (
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">Lặp đến hết ngày</span>
              <input
                className="field w-full"
                type="date"
                min={kind === "all_day" ? start : start.slice(0, 10)}
                required
                value={recurrenceUntil}
                onChange={(event) => setRecurrenceUntil(event.target.value)}
              />
            </label>
          )}

          <div className="flex items-end">
            <Button type="submit" className="w-full"><CalendarPlus size={17} /> Thêm vào lịch</Button>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Sự kiện cả ngày được lưu bằng ngày, không ép qua UTC. Chuỗi timed giữ giờ địa phương theo múi giờ tài khoản.
        </p>
      </Card>

      {selected && (
        <Card
          title={selected.recurring ? "Sửa occurrence" : "Sửa sự kiện"}
          action={selected.recurring ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--muted)]"><Repeat2 size={14} /> Chuỗi lặp</span> : undefined}
        >
          <form onSubmit={saveSelected} className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_auto]">
            <input className="field" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} required />
            <input
              className="field"
              type={selected.allDay ? "date" : "datetime-local"}
              value={editStart}
              onChange={(event) => setEditStart(event.target.value)}
              required
            />
            <input
              className="field"
              type={selected.allDay ? "date" : "datetime-local"}
              value={editEnd}
              onChange={(event) => setEditEnd(event.target.value)}
              required
            />
            <Button type="submit">{selected.recurring ? "Lưu riêng lần này" : "Lưu"}</Button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {selected.recurring && (
              <Button variant="ghost" onClick={() => void skipSelected()}><XCircle size={17} /> Bỏ lần này</Button>
            )}
            <Button variant="danger" onClick={() => void deleteWholeSeries()}>
              <Trash2 size={17} /> {selected.recurring ? "Xóa cả chuỗi" : "Xóa sự kiện"}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>Đóng</Button>
          </div>
          {selected.recurring && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              “Lưu riêng lần này” tạo exception; các lần còn lại trong chuỗi không bị thay đổi.
            </p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-3 sm:p-5">
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale={viLocale}
          firstDay={1}
          height="auto"
          events={events.map((event) => ({
            id: event.id,
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
          }))}
          eventClick={(info) => chooseOccurrence(info.event.id)}
          datesSet={(info) => {
            setRange({ start: info.start, end: info.end });
            void refresh(info.start, info.end);
          }}
          headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek" }}
          buttonText={{ today: "Hôm nay", month: "Tháng", week: "Tuần" }}
        />
      </Card>
    </div>
  );
}

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
