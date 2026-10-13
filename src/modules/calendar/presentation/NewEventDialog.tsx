import { CalendarPlus, ChevronDown } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { localDateKey } from "../../../kernel/dates";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { PeoplePicker, useAcceptedFriends } from "../../friends";
import { useMyGroups } from "../../groups";
import { calendarModule } from "../calendar.module";
import { daysBetween, shiftDays, shiftMonths } from "../domain/calendarView";
import type { RecurrenceRule } from "../domain/Occurrence";
import { eventTemplates, presetStart, quickDurations, remember, shiftMinutes, whenPresets, type EventSeed } from "../domain/quickEvent";
import { AudienceFields, audienceProblem, onlyMe, type AudienceChoice } from "./AudienceFields";
import { calendarKey } from "./keys";
import { locale, t } from "../../../kernel/i18n";

/** How long a repeating event runs when nothing else is said, in months. */
const usualRun: Record<RecurrenceRule, number> = { daily: 1, weekly: 4, monthly: 12 };
const chip = (on: boolean) => `min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold transition-colors duration-200 ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`;

// The friends and places of the last events, kept on this device. They are offered first and never
// chosen for the person: a new event is private until they say otherwise.
const recentKey = "gnouht-event-recent";
function recent(): { people: string[]; places: string[] } {
  try {
    const kept = JSON.parse(localStorage.getItem(recentKey) ?? "{}") as { people?: unknown; places?: unknown };
    const list = (value: unknown) => Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
    return { people: list(kept.people), places: list(kept.places) };
  } catch { return { people: [], places: [] }; }
}

/** What is wrong with a start and an end as typed, or "". All-day values are days, the others "YYYY-MM-DDTHH:MM". */
export function timeProblem(allDay: boolean, start: string, end: string): string {
  if (allDay) return end < start ? t("Ngày cuối phải bằng hoặc sau ngày bắt đầu.") : "";
  return new Date(end) <= new Date(start) ? t("Giờ kết thúc phải sau giờ bắt đầu.") : "";
}

/**
 * A new event in a few taps: a name, when, how long, and optionally the friends who see it. Everything
 * else is under "Tùy chọn khác". It opens on `at`; what was typed stays until an event is saved, also
 * after an error.
 */
export function NewEventDialog({ open, onOpenChange, at, onCreated }: {
  open: boolean; onOpenChange(open: boolean): void; at: EventSeed; onCreated(day: string): void;
}) {
  const calendar = useModule(calendarModule);
  const friends = useAcceptedFriends();
  const groups = useMyGroups().data ?? [];
  const { run, pending, error } = useAction(calendarKey);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [place, setPlace] = useState("");
  const [recurrence, setRecurrence] = useState<"" | RecurrenceRule>("");
  const [until, setUntil] = useState("");
  const [audience, setAudience] = useState<AudienceChoice>(onlyMe);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState("");
  const [used, setUsed] = useState(recent);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    const hour = at.time ?? (at.day === localDateKey(now) ? `${String(Math.min(now.getHours() + 1, 23)).padStart(2, "0")}:00` : "08:00");
    setProblem("");
    setAllDay(!!at.lastDay);
    setStart(at.lastDay ? at.day : `${at.day}T${hour}`);
    setEnd(at.lastDay ?? shiftMinutes(`${at.day}T${hour}`, at.minutes ?? 60));
    if (at.title !== undefined) setTitle(at.title);
    if (at.place !== undefined) setPlace(at.place);
    // A whole-day event has its days under "Tùy chọn khác".
    if (at.lastDay) setMore(true);
  }, [open, at]);

  const minutes = allDay || !start || !end ? 0 : (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
  // Moving the start moves the end with it, so the event keeps its length.
  function moveStart(next: string) {
    if (next && start && end) setEnd(allDay ? shiftDays(next, Math.max(daysBetween(start, end), 0)) : shiftMinutes(next, Math.max(minutes, 0)));
    setStart(next);
  }
  function preset(next: string) {
    if (allDay) { setAllDay(false); setEnd(shiftMinutes(next, 60)); setStart(next); } else moveStart(next);
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
  function applyTemplate(template: (typeof eventTemplates)[number]) {
    // A name the person typed themselves is kept; the name of another template gives way.
    if (!title.trim() || eventTemplates.some(item => item.title === title)) setTitle(template.title);
    if (!allDay && start) setEnd(shiftMinutes(start, template.minutes));
  }
  // Ticking friends shares the event with them; unticking the last one makes it private again.
  const pickPeople = (userIds: string[]) => setAudience({ visibility: userIds.length ? "selected_friends" : "only_me", userIds, groupId: "" });

  function create(event: FormEvent) {
    event.preventDefault();
    const wrong = timeProblem(allDay, start, end) || (recurrence && !until ? t("Hãy chọn ngày kết thúc cho sự kiện lặp lại.") : "") || audienceProblem(audience);
    setProblem(wrong);
    if (wrong) return;
    run(() => calendar.create({
      title, kind: allDay ? "all_day" : "timed", start, end, place,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      visibility: audience.visibility, audienceUserIds: audience.userIds, audienceGroupId: audience.groupId || null,
      recurrence: recurrence || null, recurrenceUntil: recurrence ? until : null,
    }), () => {
      const next = { people: remember(used.people, audience.userIds, 6), places: remember(used.places, [place], 5) };
      setUsed(next);
      try { localStorage.setItem(recentKey, JSON.stringify(next)); } catch { /* Nothing is offered first next time. */ }
      setTitle(""); setPlace(""); setRecurrence(""); setUntil(""); setAudience(onlyMe); setMore(false);
      onOpenChange(false);
      onCreated(start.slice(0, 10));
    });
  }

  const names = audience.userIds.flatMap(id => friends.find(friend => friend.userId === id)?.displayName ?? []);
  const seenBy = audience.visibility === "public" ? t("Ai dùng Gnouht và mở lịch của bạn cũng thấy tên và giờ của sự kiện này.")
    : audience.visibility === "group" ? t("Nhóm {0} sẽ thấy tên và giờ của sự kiện này.", groups.find(group => group.id === audience.groupId)?.name ?? "…")
    : names.length ? t("{0} sẽ thấy tên và giờ của sự kiện này.", names.join(", "))
    : t("Chỉ mình bạn thấy sự kiện này.");
  const endTime = !allDay && start && end && minutes > 0
    ? new Date(end).toLocaleString(locale, end.slice(0, 10) === start.slice(0, 10) ? { hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" }) : "";
  const now = new Date();

  return <DialogPanel size="sm" open={open} onOpenChange={onOpenChange} returnFocusId="create-event-trigger" title={t("Thêm sự kiện")} description={t("Tên, lúc nào, bao lâu. Phần còn lại là tùy chọn.")} busy={pending}>
    <form onSubmit={create} className="grid gap-4" aria-busy={pending}>
      <div className="grid gap-2">
        <label className="grid gap-1 text-sm font-semibold">{t("Tên sự kiện")}
          <input className="field" data-dialog-initial-focus required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} placeholder={t("Ví dụ: Họp nhóm đồ án")} />
        </label>
        <div role="group" aria-label={t("Mẫu có sẵn")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {eventTemplates.map(template => <button key={template.title} type="button" aria-pressed={title === template.title} onClick={() => applyTemplate(template)} className={chip(title === template.title)}>{template.title}</button>)}
        </div>
      </div>

      <div className="grid gap-2">
        {!allDay && <div role="group" aria-label={t("Lúc nào")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {whenPresets.map(([id, label]) => { const value = presetStart(id, now); return <button key={id} type="button" aria-pressed={start === value} onClick={() => preset(value)} className={chip(start === value)}>{label}</button>; })}
        </div>}
        {!allDay && <label className="grid gap-1 text-sm font-semibold">{t("Bắt đầu")}
          <input className="field" type="datetime-local" required value={start} onChange={event => moveStart(event.target.value)} />
        </label>}
        {!allDay && <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("Kéo dài")} className="flex gap-2">
            {quickDurations.map(([value, label]) => <button key={value} type="button" aria-pressed={minutes === value} onClick={() => start && setEnd(shiftMinutes(start, value))} className={chip(minutes === value)}>{label}</button>)}
          </div>
          {endTime && <p className="text-sm text-[var(--muted)]">{t("đến {0}", endTime)}</p>}
        </div>}
      </div>

      {(audience.visibility === "only_me" || audience.visibility === "selected_friends") && friends.length > 0
        && <PeoplePicker legend={t("Với ai? (tùy chọn)")} value={audience.userIds} onChange={pickPeople} first={used.people} />}

      <div className="rounded-2xl bg-[var(--soft)]">
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-semibold">
          {t("Tùy chọn khác")} <ChevronDown size={17} className={`transition-transform duration-200 ${more ? "rotate-180" : ""}`} />
        </button>
        {more && <div className="grid gap-3 px-3 pb-3 md:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--surface)] px-3 text-sm font-semibold md:col-span-2">
            <input type="checkbox" className="size-4" checked={allDay} onChange={event => switchAllDay(event.target.checked)} /> {t("Cả ngày")}
          </label>
          {allDay && <label className="grid gap-1 text-sm font-semibold">{t("Ngày bắt đầu")}
            <input className="field" type="date" required value={start} onChange={event => moveStart(event.target.value)} />
          </label>}
          <label className="grid gap-1 text-sm font-semibold">{allDay ? t("Ngày cuối") : t("Kết thúc")}
            <input className="field" type={allDay ? "date" : "datetime-local"} required value={end} onChange={event => setEnd(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t("Địa điểm (tùy chọn)")}
            <input className="field" maxLength={80} list="recent-places" value={place} onChange={event => setPlace(event.target.value)} placeholder={t("Phòng, quán, địa chỉ…")} />
            <datalist id="recent-places">{used.places.map(item => <option key={item} value={item} />)}</datalist>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t("Lặp lại")}
            <select className="field" value={recurrence} onChange={event => repeat(event.target.value as "" | RecurrenceRule)}>
              <option value="">{t("Không lặp")}</option>
              <option value="daily">{t("Mỗi ngày")}</option>
              <option value="weekly">{t("Mỗi tuần")}</option>
              <option value="monthly">{t("Mỗi tháng")}</option>
            </select>
          </label>
          {recurrence && <label className="grid gap-1 text-sm font-semibold">{t("Lặp đến hết ngày")}
            <input className="field" type="date" required min={start.slice(0, 10)} value={until} onChange={event => setUntil(event.target.value)} />
          </label>}
          {/* The friends are ticked above; here is the choice between them, a group and everyone. */}
          <AudienceFields people={false} value={audience} onChange={setAudience} />
        </div>}
      </div>

      {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{problem || error}</p>}
      <div className="grid gap-2">
        <p role="status" aria-label={t("Ai thấy sự kiện này")} className="text-sm leading-6 text-[var(--muted)]">{seenBy}</p>
        <Button type="submit" className="w-full" disabled={pending}><CalendarPlus size={17} /> {pending ? t("Đang lưu…") : t("Thêm vào lịch")}</Button>
      </div>
    </form>
  </DialogPanel>;
}
