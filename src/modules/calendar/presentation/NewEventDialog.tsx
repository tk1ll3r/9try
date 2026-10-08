import { CalendarPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { localDateKey, localDateTimeKey } from "../../../kernel/dates";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { calendarModule } from "../calendar.module";
import { daysBetween, shiftDays, shiftMonths } from "../domain/calendarView";
import type { RecurrenceRule } from "../domain/Occurrence";
import { AudienceFields, audienceProblem, onlyMe } from "./AudienceFields";
import { calendarKey } from "./keys";

/** How long a repeating event runs when nothing else is said, in months. */
const usualRun: Record<RecurrenceRule, number> = { daily: 1, weekly: 4, monthly: 12 };
const later = (value: string, minutes: number) => localDateTimeKey(new Date(new Date(value).getTime() + minutes * 60_000));

/** What is wrong with a start and an end as typed, or "". All-day values are days, the others "YYYY-MM-DDTHH:MM". */
export function timeProblem(allDay: boolean, start: string, end: string): string {
  if (allDay) return end < start ? "Ngày cuối phải bằng hoặc sau ngày bắt đầu." : "";
  return new Date(end) <= new Date(start) ? "Giờ kết thúc phải sau giờ bắt đầu." : "";
}

/**
 * The form for a new event. It opens on the day in `at`: at the given time, or else at the next full
 * hour today and at 08:00 on another day. What was typed stays until an event is saved.
 */
export function NewEventDialog({ open, onOpenChange, at, onCreated }: {
  open: boolean; onOpenChange(open: boolean): void; at: { day: string; time?: string }; onCreated(day: string): void;
}) {
  const calendar = useModule(calendarModule);
  const { run, pending, error } = useAction(calendarKey);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [place, setPlace] = useState("");
  const [recurrence, setRecurrence] = useState<"" | RecurrenceRule>("");
  const [until, setUntil] = useState("");
  const [audience, setAudience] = useState(onlyMe);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const hour = at.time ?? (at.day === localDateKey(now) ? `${String(Math.min(now.getHours() + 1, 23)).padStart(2, "0")}:00` : "08:00");
    setProblem("");
    setAllDay(false);
    setStart(`${at.day}T${hour}`);
    setEnd(later(`${at.day}T${hour}`, 60));
  }, [open, at.day, at.time]);

  // Moving the start moves the end with it, so the event keeps its length.
  function moveStart(next: string) {
    if (next && start && end) setEnd(allDay ? shiftDays(next, Math.max(daysBetween(start, end), 0)) : later(next, Math.max((new Date(end).getTime() - new Date(start).getTime()) / 60_000, 0)));
    setStart(next);
  }
  function switchAllDay(next: boolean) {
    const day = start.slice(0, 10) || at.day;
    setAllDay(next);
    setStart(next ? day : `${day}T08:00`);
    setEnd(next ? (end.slice(0, 10) >= day ? end.slice(0, 10) : day) : `${day}T09:00`);
  }
  function repeat(next: "" | RecurrenceRule) {
    setRecurrence(next);
    if (next && start) setUntil(shiftMonths(start.slice(0, 10), usualRun[next]));
  }

  function create(event: FormEvent) {
    event.preventDefault();
    const wrong = timeProblem(allDay, start, end) || (recurrence && !until ? "Hãy chọn ngày kết thúc cho sự kiện lặp lại." : "") || audienceProblem(audience);
    setProblem(wrong);
    if (wrong) return;
    run(() => calendar.create({
      title, kind: allDay ? "all_day" : "timed", start, end, place,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: audience.visibility, audienceUserIds: audience.userIds, audienceGroupId: audience.groupId || null,
      recurrence: recurrence || null, recurrenceUntil: recurrence ? until : null,
    }), () => {
      setTitle(""); setPlace(""); setRecurrence(""); setUntil(""); setAudience(onlyMe);
      onOpenChange(false);
      onCreated(start.slice(0, 10));
    });
  }

  const field = allDay ? "date" : "datetime-local";
  return <DialogPanel open={open} onOpenChange={onOpenChange} returnFocusId="create-event-trigger" title="Thêm sự kiện" description="Chỉ mình bạn thấy sự kiện, trừ khi bạn chọn chia sẻ ở dưới." busy={pending}>
    <form onSubmit={create} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-semibold md:col-span-2">Tên sự kiện
        <input className="field" data-dialog-initial-focus required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Họp nhóm đồ án" />
      </label>
      <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold md:col-span-2">
        <input type="checkbox" className="size-4" checked={allDay} onChange={event => switchAllDay(event.target.checked)} /> Cả ngày
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? "Ngày bắt đầu" : "Bắt đầu"}
        <input className="field" type={field} required value={start} onChange={event => moveStart(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? "Ngày cuối" : "Kết thúc"}
        <input className="field" type={field} required value={end} onChange={event => setEnd(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Địa điểm (tùy chọn)
        <input className="field" maxLength={80} value={place} onChange={event => setPlace(event.target.value)} placeholder="Phòng, quán, địa chỉ…" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Lặp lại
        <select className="field" value={recurrence} onChange={event => repeat(event.target.value as "" | RecurrenceRule)}>
          <option value="">Không lặp</option>
          <option value="daily">Mỗi ngày</option>
          <option value="weekly">Mỗi tuần</option>
          <option value="monthly">Mỗi tháng</option>
        </select>
      </label>
      {recurrence && <label className="grid gap-1 text-sm font-semibold">Lặp đến hết ngày
        <input className="field" type="date" required min={start.slice(0, 10)} value={until} onChange={event => setUntil(event.target.value)} />
      </label>}
      <AudienceFields value={audience} onChange={setAudience} />
      {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)] md:col-span-2">{problem || error}</p>}
      <div className="md:col-span-2"><Button type="submit" className="w-full sm:w-auto" disabled={pending}><CalendarPlus size={17} /> {pending ? "Đang lưu…" : "Thêm vào lịch"}</Button></div>
    </form>
  </DialogPanel>;
}
