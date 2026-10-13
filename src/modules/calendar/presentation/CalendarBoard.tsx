import { ChevronLeft, ChevronRight, MapPin, Plus, Repeat2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localDateKey } from "../../../kernel/dates";
import { Card } from "../../../kernel/ui/Card";
import { clock, dayTitle, entriesByDay, fillsDay, minutesOn, monthTitle, monthWeeks, nearDay, shiftDays, shiftMonths, weekOf, weekdayLetters, type CalendarEntry, type EntryTone } from "../domain/calendarView";
import { toneOf } from "./tone";
import { WeekGrid } from "./WeekGrid";
import { t } from "../../../kernel/i18n";

type View = "agenda" | "week" | "month";
const views: [View, string][] = [["agenda", t("Lịch biểu")], ["week", t("Tuần")], ["month", t("Tháng")]];
const viewKey = "gnouht-calendar-view";
const toneNames: [EntryTone, string][] = [["event", t("Sự kiện")], ["class", t("Lớp học")], ["activity", t("Hoạt động")], ["busy", t("Bận")]];

/** A phone opens on the week's list, a wider screen on the month. A view chosen before is kept on this device. */
function firstView(): View {
  try {
    const kept = localStorage.getItem(viewKey);
    if (views.some(([name]) => name === kept)) return kept as View;
  } catch { /* Storage may be blocked. */ }
  return window.matchMedia("(max-width: 767px)").matches ? "agenda" : "month";
}

const round = "pressable grid size-10 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--soft)]";

/**
 * The calendar itself: a week or a month of days with the chosen day's entries listed beside it, or a
 * week as an hour grid. Days are "YYYY-MM-DD". Without `onOpen` the entries cannot be opened; without
 * `onAdd` there is nothing to add to.
 */
export function CalendarBoard({ entries, day, onDay, onRange, onOpen, onAdd }: {
  entries: readonly CalendarEntry[];
  day: string;
  onDay(day: string): void;
  /** Called with the first day on screen and the day after the last one, whenever those change. */
  onRange(from: string, until: string): void;
  onOpen?(entry: CalendarEntry): void;
  onAdd?(day: string, time?: string): void;
}) {
  const [view, setView] = useState<View>(firstView);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = localDateKey(now);
  const weeks = useMemo(() => view === "month" ? monthWeeks(day) : [weekOf(day)], [view, day]);
  const from = weeks[0][0], until = shiftDays(weeks.at(-1)![6], 1);
  // Only the days decide when to report; the callback itself is new on every render of the screen.
  useEffect(() => { onRange(from, until); }, [from, until]);
  const byDay = useMemo(() => entriesByDay(entries), [entries]);
  const tones = toneNames.filter(([name]) => entries.some(entry => entry.tone === name));
  const [before, after] = view === "month" ? [t("Tháng trước"), t("Tháng sau")] : [t("Tuần trước"), t("Tuần sau")];
  const move = (direction: 1 | -1) => onDay(view === "month" ? shiftMonths(day, direction) : shiftDays(day, 7 * direction));

  function choose(next: View) {
    setView(next);
    try { localStorage.setItem(viewKey, next); } catch { /* The view then lasts for this visit. */ }
  }

  return <Card className="p-4 sm:p-5">
    {/* A phone has the month and the arrows on one row and the views under it; a wider screen has one row. */}
    <div className="flex flex-wrap items-center gap-2">
      <h2 aria-live="polite" className="mr-auto text-2xl font-black tracking-[-.03em]">{monthTitle(day)}</h2>
      <div className="flex items-center sm:order-last">
        <button type="button" aria-label={before} onClick={() => move(-1)} className={round}><ChevronLeft size={20} /></button>
        <button type="button" aria-label={after} onClick={() => move(1)} className={round}><ChevronRight size={20} /></button>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div role="group" aria-label={t("Cách xem lịch")} className="flex flex-1 gap-1 rounded-2xl bg-[var(--soft)] p-1">
          {views.map(([name, label]) => <button key={name} type="button" aria-pressed={view === name} onClick={() => choose(name)}
            className={`min-h-9 flex-1 whitespace-nowrap rounded-xl px-2.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 sm:px-3.5 ${view === name ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>{label}</button>)}
        </div>
        <button type="button" onClick={() => onDay(today)} className="pressable min-h-10 whitespace-nowrap rounded-full border border-[var(--border)] px-3.5 text-sm font-semibold">{t("Hôm nay")}</button>
      </div>
    </div>

    {view === "week" ? <WeekGrid week={weeks[0]} day={day} today={today} now={now} byDay={byDay} onDay={onDay} onOpen={onOpen} onAdd={onAdd} />
      : <div className={view === "month" ? "xl:grid xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:gap-5" : ""}>
        <DayGrid weeks={weeks} day={day} today={today} byDay={byDay} onDay={onDay} detail={view === "month"} />
        <DayAgenda day={day} today={today} now={now} entries={byDay.get(day) ?? []} onOpen={onOpen} onAdd={onAdd}
          className={`mt-4 border-t border-[var(--border)] pt-4 ${view === "month" ? "xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" : ""}`} />
      </div>}

    {tones.length > 1 && <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
      {tones.map(([name, label]) => <span key={name} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: `var(--tone-${name})` }} />{label}</span>)}
    </p>}
  </Card>;
}

/** Rows of weeks. A day shows a dot for each entry; with `detail`, a wide screen shows the titles instead. */
function DayGrid({ weeks, day, today, byDay, onDay, detail }: {
  weeks: string[][]; day: string; today: string; byDay: Map<string, CalendarEntry[]>; onDay(day: string): void; detail: boolean;
}) {
  return <div className="mt-4">
    <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-[11px] font-bold tracking-wider text-[var(--muted)]">
      {weekdayLetters.map(letter => <span key={letter}>{letter}</span>)}
    </div>
    <div className="grid grid-cols-7 gap-x-1 gap-y-0.5 md:gap-y-1">
      {weeks.flat().map(date => {
        const list = byDay.get(date) ?? [];
        const chosen = date === day;
        // In a month, the days of the months around it are there to fill the weeks.
        const outside = detail && date.slice(0, 7) !== day.slice(0, 7);
        return <button key={date} type="button" aria-pressed={chosen} aria-current={date === today ? "date" : undefined}
          aria-label={`${dayTitle(date)}${list.length ? t(", {0} mục", list.length) : ""}`} onClick={() => onDay(date)}
          className={`flex min-h-[3.25rem] min-w-0 flex-col items-center gap-1 rounded-2xl p-1 transition-colors duration-200 ${detail ? "md:min-h-28 md:items-stretch md:text-left" : ""} ${chosen ? "bg-[var(--soft)]" : "hover:bg-[color-mix(in_srgb,var(--soft)_55%,transparent)]"}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${chosen ? "bg-[var(--ink)] text-[var(--paper)]" : date === today ? "bg-[var(--lime)] text-[var(--ink)]" : outside ? "text-[var(--muted)] opacity-50" : ""}`}>{Number(date.slice(8))}</span>
          <span className={`flex h-1.5 gap-0.5 ${detail ? "md:hidden" : ""}`}>
            {list.slice(0, 3).map(entry => <i key={entry.id} style={toneOf(entry)} className="size-1.5 rounded-full bg-[var(--tone)]" />)}
          </span>
          {detail && <span className={`hidden min-w-0 flex-col gap-0.5 md:flex ${outside ? "opacity-50" : ""}`}>
            {list.slice(0, 3).map(entry => <span key={entry.id} style={toneOf(entry)} className="truncate rounded-md border-l-[3px] border-[var(--tone)] bg-[color-mix(in_srgb,var(--tone)_14%,transparent)] px-1 py-0.5 text-[11px] font-semibold leading-4">{entry.title}</span>)}
            {list.length > 3 && <span className="px-1 text-[11px] font-semibold text-[var(--muted)]">{t("+{0} nữa", list.length - 3)}</span>}
          </span>}
        </button>;
      })}
    </div>
  </div>;
}

/** Everything on one day, in time order, with full titles. */
function DayAgenda({ day, today, now, entries, onOpen, onAdd, className }: {
  day: string; today: string; now: Date; entries: CalendarEntry[]; onOpen?(entry: CalendarEntry): void; onAdd?(day: string): void; className: string;
}) {
  const near = nearDay(day, today);
  const minute = now.getHours() * 60 + now.getMinutes();
  return <section aria-label={t("Lịch {0}", dayTitle(day))} className={className}>
    <div className="mb-3 flex min-h-10 items-center justify-between gap-3">
      <h3 className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-bold">{near && <span className="rounded-full bg-[var(--lime)] px-2.5 py-1 text-xs text-[var(--ink)]">{near}</span>}<span>{dayTitle(day)}</span></h3>
      {onAdd && <button type="button" aria-label={t("Thêm sự kiện vào {0}", dayTitle(day))} onClick={() => onAdd(day)}
        className="pressable grid size-10 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Plus size={19} /></button>}
    </div>
    {entries.length ? <ul className="space-y-2">
      {entries.map(entry => {
        const [from, to] = minutesOn(entry, day);
        const whole = fillsDay(entry, day);
        // Only today tells what is over from what is still to come; a past day is over as a whole.
        const over = day === today && !whole && minute >= to;
        const running = day === today && !whole && minute >= from && minute < to;
        const Row = onOpen ? "button" : "div";
        return <li key={entry.id}>
          <Row {...(onOpen ? { type: "button", onClick: () => onOpen(entry) } : {})} style={toneOf(entry)}
            aria-label={onOpen ? `${entry.title}, ${whole ? t("cả ngày") : t("{0} đến {1}", clock(from), clock(to))}` : undefined}
            className={`flex w-full items-stretch gap-3 rounded-2xl bg-[color-mix(in_srgb,var(--tone)_11%,var(--surface))] p-3 text-left ${onOpen ? "pressable" : ""} ${over ? "opacity-70" : ""}`}>
            <span aria-hidden className="w-1 shrink-0 rounded-full bg-[var(--tone)]" />
            <span className="w-12 shrink-0 tabular-nums leading-5">
              {whole ? <b className="text-xs">{t("Cả ngày")}</b> : <><b className="block text-sm">{clock(from)}</b><span className="text-xs text-[var(--muted)]">{clock(to)}</span></>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words font-semibold leading-5">{entry.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-[var(--muted)] empty:hidden">
                {entry.kind && <span>{entry.kind}</span>}
                {entry.place && <span className="inline-flex items-center gap-1"><MapPin size={12} />{entry.place}</span>}
                {entry.audience && <span className="inline-flex items-center gap-1"><UsersRound size={12} />{entry.audience}</span>}
                {entry.recurring && <span className="inline-flex items-center gap-1"><Repeat2 size={12} />{t("Lặp lại")}</span>}
              </span>
            </span>
            {running && <span className="self-center rounded-full bg-[var(--lime)] px-2 py-0.5 text-[11px] font-bold text-[var(--ink)]">{t("Đang diễn ra")}</span>}
          </Row>
        </li>;
      })}
    </ul> : <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">{t("Ngày này chưa có gì.")}</p>}
  </section>;
}
