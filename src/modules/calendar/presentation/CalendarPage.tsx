import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/react/daygrid";
import interactionPlugin from "@fullcalendar/react/interaction";
import listPlugin from "@fullcalendar/react/list";
import timeGridPlugin from "@fullcalendar/react/timegrid";
import themePlugin from "@fullcalendar/react/themes/monarch";
import viLocale from "@fullcalendar/react/locales/vi";
import "@fullcalendar/react/skeleton.css";
import "@fullcalendar/react/themes/monarch/theme.css";
import "@fullcalendar/react/themes/monarch/palettes/purple.css";
import { CalendarPlus, Download, Link2, Repeat2, Trash2, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { useNavigate } from "react-router-dom";
import type { AgendaItem } from "../../../kernel/module";
import { useAgenda, useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import { toIcs } from "../domain/icsExport";
import { CalendarFeedCard } from "./CalendarFeedCard";
import type { CalendarOccurrence, CalendarVisibility, RecurrenceRule } from "../domain/Occurrence";
import { PeoplePicker } from "../../friends";
import { useMyGroups } from "../../groups";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { lazy, Suspense } from "react";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
const IcsImportCard = lazy(() => import("./IcsImportCard").then(m => ({ default: m.IcsImportCard })));

type EventKind = "timed" | "all_day";

export function CalendarPage() {
  const calendar = useModule(calendarModule);
  const loadAgenda = useAgenda();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarOccurrence[]>([]);
  // What other modules put on the calendar, such as confirmed meetups. Shown, but changed on their own screens.
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [range, setRange] = useState<{ start: Date; end: Date } | null>(null);
  const [kind, setKind] = useState<EventKind>("timed");
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [recurrence, setRecurrence] = useState<"" | RecurrenceRule>("");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [visibility, setVisibility] = useState<CalendarVisibility>("only_me");
  const groups = useMyGroups().data ?? [];
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [audienceGroupId, setAudienceGroupId] = useState("");
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [message, setMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showFeed, setShowFeed] = useState(false);
  const [creating, setCreating] = useState(false);
  const createLock = useRef(false);

  async function refresh(startDate = range?.start, endDate = range?.end) {
    if (!startDate || !endDate) return;
    try {
      const [occurrences, items] = await Promise.all([calendar.listOccurrences(startDate, endDate), loadAgenda(startDate, endDate)]);
      setEvents(occurrences);
      setAgenda(items);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải lịch.");
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (createLock.current) return;

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
    if (visibility === "selected_friends" && selectedFriendIds.length === 0) {
      setMessage("Hãy chọn ít nhất một người bạn được xem sự kiện.");
      return;
    }
    if (visibility === "group" && !audienceGroupId) {
      setMessage("Hãy chọn nhóm được xem sự kiện.");
      return;
    }

    createLock.current = true;
    setCreating(true);
    try {
      await calendar.create({
        title,
        kind,
        start,
        end,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        visibility,
        recurrence: recurrence || null,
        recurrenceUntil: recurrenceUntil || null,
        audienceUserIds: visibility === "selected_friends" ? selectedFriendIds : [],
        audienceGroupId: visibility === "group" ? audienceGroupId : null,
      });
      setTitle("");
      setStart("");
      setEnd("");
      setRecurrence("");
      setRecurrenceUntil("");
      setVisibility("only_me");
      setSelectedFriendIds([]);
      setAudienceGroupId("");
      setCreateOpen(false);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo sự kiện.");
    } finally { createLock.current = false; setCreating(false); }
  }

  async function exportIcs() {
    try {
      const url = URL.createObjectURL(new Blob([toIcs(await calendar.listEvents())], { type: "text/calendar" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "gnouht-lich.ics";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất lịch.");
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
        await calendar.editOccurrence({
          eventId: selected.eventId,
          occurrenceDate: selected.occurrenceDate,
          title: editTitle,
          allDay: selected.allDay,
          start: editStart,
          end: editEnd,
        });
        setMessage("Đã sửa riêng occurrence này.");
      } else {
        await calendar.updateWholeEvent({
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

  async function saveWholeSeries() {
    if (!selected?.recurring) return;
    try {
      await calendar.updateWholeSeriesFromOccurrence({
        occurrence: selected,
        title: editTitle,
        start: editStart,
        end: editEnd,
      });
      setSelected(null);
      setMessage("Đã áp dụng tên và giờ/thời lượng cho toàn bộ chuỗi.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể cập nhật toàn bộ chuỗi.");
    }
  }

  async function skipSelected() {
    if (!selected?.recurring) return;
    try {
      await calendar.skipOccurrence(selected.eventId, selected.occurrenceDate);
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
      await calendar.deleteWholeEvent(selected.eventId);
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

      <div className="flex flex-wrap gap-2">
        <Button id="create-event-trigger" onClick={() => { setMessage(""); setCreateOpen(true); }}><CalendarPlus size={17} /> Thêm sự kiện</Button>
        <Button variant="ghost" onClick={() => setShowImport(value => !value)} aria-expanded={showImport}>{showImport ? "Ẩn nhập lịch .ics" : "Nhập lịch .ics"}</Button>
        <Button variant="ghost" onClick={() => void exportIcs()}><Download size={17} /> Xuất lịch .ics</Button>
        <Button variant="ghost" onClick={() => setShowFeed(value => !value)} aria-expanded={showFeed}><Link2 size={17} /> {showFeed ? "Ẩn liên kết lịch" : "Liên kết lịch"}</Button>
      </div>
      <DialogPanel open={createOpen} onOpenChange={setCreateOpen} returnFocusId="create-event-trigger" title="Thêm sự kiện" description="Chỉ mình bạn được xem theo mặc định. Chọn chia sẻ hoặc lặp khi cần." busy={creating}>
        {message && <p role="alert" className="mb-4 text-sm text-[var(--danger)]">{message}</p>}
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <input
            className="field md:col-span-2"
            aria-label="Tên sự kiện"
            data-dialog-initial-focus
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Tên sự kiện"
          />

          <select className="field" aria-label="Loại sự kiện" value={kind} onChange={(event) => {
            setKind(event.target.value as EventKind);
            setStart("");
            setEnd("");
          }}>
            <option value="timed">Có giờ cụ thể</option>
            <option value="all_day">Cả ngày</option>
          </select>

          <select className="field" aria-label="Lặp lại" value={recurrence} onChange={(event) => setRecurrence(event.target.value as "" | RecurrenceRule)}>
            <option value="">Không lặp</option>
            <option value="daily">Mỗi ngày</option>
            <option value="weekly">Mỗi tuần</option>
            <option value="monthly">Mỗi tháng</option>
          </select>

          <label>
            <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">Ai được xem?</span>
            <select
              className="field w-full"
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value as CalendarVisibility);
                setSelectedFriendIds([]);
                setAudienceGroupId("");
              }}
            >
              <option value="only_me">Chỉ mình tôi</option>
              <option value="selected_friends">Bạn bè được chọn</option>
              <option value="group">Một nhóm được chọn</option>
              <option value="public">Công khai</option>
            </select>
          </label>

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

          {visibility === "selected_friends" && (
            <div className="md:col-span-2">
              <PeoplePicker legend="Bạn bè được xem nội dung sự kiện" value={selectedFriendIds} onChange={setSelectedFriendIds} />
            </div>
          )}

          {visibility === "group" && (
            <label className="md:col-span-2">
              <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">Nhóm được xem</span>
              <select className="field w-full" value={audienceGroupId} onChange={(event) => setAudienceGroupId(event.target.value)} required>
                <option value="">Chọn nhóm</option>
                {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </label>
          )}

          {visibility === "public" && (
            <div className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-950 md:col-span-2 xl:col-span-4">
              Công khai là lựa chọn chủ động. Projection chia sẻ vẫn không trả địa chỉ chính xác hay ghi chú riêng tư.
            </div>
          )}

          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={creating}><CalendarPlus size={17} /> {creating ? "Đang lưu…" : "Thêm vào lịch"}</Button>
          </div>
        </form>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Sự kiện cả ngày được lưu bằng ngày, không ép qua UTC. Chuỗi timed giữ giờ địa phương theo múi giờ tài khoản.
        </p>
      </DialogPanel>

      {showImport && <Suspense fallback={<p role="status">Đang tải công cụ nhập lịch…</p>}><IcsImportCard onImported={refresh} /></Suspense>}
      {showFeed && <CalendarFeedCard />}

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
              <>
                <Button variant="secondary" onClick={() => void saveWholeSeries()}><Repeat2 size={17} /> Áp dụng cho cả chuỗi</Button>
                <Button variant="ghost" onClick={() => void skipSelected()}><XCircle size={17} /> Bỏ lần này</Button>
              </>
            )}
            <Button variant="danger" onClick={() => void deleteWholeSeries()}>
              <Trash2 size={17} /> {selected.recurring ? "Xóa cả chuỗi" : "Xóa sự kiện"}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>Đóng</Button>
          </div>
          {selected.recurring && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              “Lưu riêng lần này” tạo exception. “Áp dụng cho cả chuỗi” thay tên và giờ/thời lượng cho mọi lần nhưng giữ ngày neo và quy tắc lặp hiện tại.
            </p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden p-3 sm:p-5">
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={window.matchMedia("(max-width: 640px)").matches ? "listWeek" : "dayGridMonth"}
          locale={viLocale}
          firstDay={1}
          height="auto"
          events={[...events.map((event) => ({
            id: event.id,
            title: event.place ? `${event.title} · ${event.place}` : event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
          })), ...agenda.map(item => ({
            id: `agenda:${item.id}`, title: `${item.title} · ${item.kind}`, start: item.start, end: item.end, allDay: false, extendedProps: { to: item.to },
          }))]}
          eventClick={(info) => {
            const to = info.event.extendedProps.to as string | undefined;
            if (to) navigate(to); else chooseOccurrence(info.event.id);
          }}
          dateClick={(info) => {
            setMessage(""); setKind(info.allDay ? "all_day" : "timed");
            if (info.allDay) { setStart(info.dateStr); setEnd(info.dateStr); }
            else { setStart(toLocalDateTimeInput(info.date.toISOString())); setEnd(toLocalDateTimeInput(new Date(info.date.getTime() + 60 * 60_000).toISOString())); }
            setCreateOpen(true);
          }}
          datesSet={(info) => {
            setRange({ start: info.start, end: info.end });
            void refresh(info.start, info.end);
          }}
          headerToolbar={{ left: "prev,next today", center: "title", right: "listWeek,dayGridMonth,timeGridWeek" }}
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
