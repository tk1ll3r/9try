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
import { type FormEvent, useEffect, useState } from "react";
import { Temporal } from "temporal-polyfill";
import { useAuth } from "../../../bootstrap/AuthProvider";
import {
  calendarData,
  type CalendarOccurrence,
  type CalendarVisibility,
  type RecurrenceRule,
} from "../infrastructure/CalendarData";
import { friendsData, type FriendConnection } from "../../friends/infrastructure/FriendsData";
import { groupsData, type GroupSummary } from "../../groups/infrastructure/GroupsData";
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
  const [visibility, setVisibility] = useState<CalendarVisibility>("only_me");
  const [friends, setFriends] = useState<FriendConnection[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [audienceGroupId, setAudienceGroupId] = useState("");
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;
    void Promise.all([friendsData.list(), groupsData.list(user.id)])
      .then(([connections, nextGroups]) => {
        setFriends(connections.filter((connection) => connection.status === "accepted"));
        setGroups(nextGroups);
      })
      .catch(() => {
        setFriends([]);
        setGroups([]);
      });
  }, [user?.id]);

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
    if (visibility === "selected_friends" && selectedFriendIds.length === 0) {
      setMessage("Hãy chọn ít nhất một người bạn được xem sự kiện.");
      return;
    }
    if (visibility === "group" && !audienceGroupId) {
      setMessage("Hãy chọn nhóm được xem sự kiện.");
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

  async function saveWholeSeries() {
    if (!selected?.recurring) return;
    try {
      await calendarData.updateWholeSeriesFromOccurrence({
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
            <fieldset className="rounded-2xl bg-[var(--soft)] p-3 md:col-span-2 xl:col-span-4">
              <legend className="px-1 text-xs font-bold text-[var(--muted)]">Bạn bè được xem nội dung sự kiện</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {friends.length === 0 && <span className="text-sm text-[var(--muted)]">Chưa có bạn bè để chọn.</span>}
                {friends.map((friend) => {
                  const checked = selectedFriendIds.includes(friend.userId);
                  return (
                    <label key={friend.userId} className="flex items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm font-semibold">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedFriendIds((current) =>
                          checked ? current.filter((id) => id !== friend.userId) : [...current, friend.userId]
                        )}
                      />
                      {friend.displayName}
                    </label>
                  );
                })}
              </div>
            </fieldset>
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
