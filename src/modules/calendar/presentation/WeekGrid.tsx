import { useEffect, useRef } from "react";
import { clock, dayBlocks, dayTitle, fillsDay, hourRange, minutesOn, weekdayLetters, type CalendarEntry } from "../domain/calendarView";
import { toneOf } from "./tone";
import { t } from "../../../kernel/i18n";

/** The height of one hour, in pixels. */
const hourHeight = 48;
// On a phone the hours stay in place while the days scroll under them, so they need a ground of their own.
const gutter = "sticky left-0 z-[2] bg-[var(--surface)] md:bg-transparent";

/**
 * A week as seven columns of hours. An entry is a block as tall as it is long; entries at the same
 * time stand side by side. On a phone the columns keep a readable width and the grid scrolls sideways.
 */
export function WeekGrid({ week, day, today, now, byDay, onDay, onOpen, onAdd }: {
  week: string[]; day: string; today: string; now: Date; byDay: Map<string, CalendarEntry[]>;
  onDay(day: string): void; onOpen?(entry: CalendarEntry): void; onAdd?(day: string, time?: string): void;
}) {
  const columns = week.map(date => {
    const list = byDay.get(date) ?? [];
    return { date, whole: list.filter(entry => fillsDay(entry, date)), blocks: dayBlocks(list, date) };
  });
  const [first, last] = hourRange(columns.flatMap(column => column.blocks));
  const height = (last - first) * hourHeight;
  const top = (minutes: number) => (minutes - first * 60) / 60 * hourHeight;
  const minute = now.getHours() * 60 + now.getMinutes();
  const Block = onOpen ? "button" : "div";

  // Where the grid is wider than the screen, the chosen day is brought to the middle of it.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const column = box?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (box && column) box.scrollLeft = column.offsetLeft - (box.clientWidth - column.offsetWidth) / 2;
  }, [day]);

  return <div ref={scroller} className="mt-4 overflow-x-auto">
    <div className="grid grid-cols-[2.75rem_repeat(7,minmax(5.25rem,1fr))]">
      <span className={gutter} />
      {week.map((date, index) => <button key={date} type="button" aria-pressed={date === day} aria-current={date === today ? "date" : undefined} aria-label={dayTitle(date)} onClick={() => onDay(date)}
        className="flex flex-col items-center gap-0.5 pb-2 text-[11px] font-bold tracking-wider text-[var(--muted)]">
        {weekdayLetters[index]}
        <span className={`grid size-8 place-items-center rounded-full text-sm tracking-normal ${date === day ? "bg-[var(--ink)] text-[var(--paper)]" : date === today ? "bg-[var(--lime)] text-[#1d230e]" : "text-[var(--ink)]"}`}>{Number(date.slice(8))}</span>
      </button>)}

      {columns.some(column => column.whole.length) && <>
        <span className={`${gutter} pr-1.5 pt-1 text-right text-[10px] leading-3 text-[var(--muted)]`}>{t("Cả ngày")}</span>
        {columns.map(column => <div key={column.date} className="space-y-0.5 border-l border-[var(--border)] px-0.5 pb-1.5">
          {column.whole.map(entry => <Block key={entry.id} {...(onOpen ? { type: "button", onClick: () => onOpen(entry) } : {})} style={toneOf(entry)}
            className="block w-full truncate rounded-md border-l-[3px] border-[var(--tone)] bg-[color-mix(in_srgb,var(--tone)_18%,var(--surface))] px-1.5 py-0.5 text-left text-[11px] font-semibold leading-4">{entry.title}</Block>)}
        </div>)}
      </>}

      <div className={`${gutter} relative`} style={{ height }}>
        {Array.from({ length: last - first - 1 }, (_, index) => first + index + 1).map(hour => <span key={hour} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-[var(--muted)]" style={{ top: top(hour * 60) }}>{clock(hour * 60)}</span>)}
      </div>
      {columns.map(column => <div key={column.date} className={`relative border-l border-[var(--border)] ${column.date === day ? "bg-[color-mix(in_srgb,var(--soft)_45%,transparent)]" : ""}`}
        style={{ height, backgroundImage: `repeating-linear-gradient(to bottom, color-mix(in srgb, var(--border) 70%, transparent) 0 1px, transparent 1px ${hourHeight}px)` }}
        // A click on an empty hour starts an event there.
        onClick={onAdd && (event => { if (event.target === event.currentTarget) onAdd(column.date, clock((first + Math.floor(event.nativeEvent.offsetY / hourHeight)) * 60)); })}>
        {column.blocks.map(({ entry, from, to, lane, lanes }) => <Block key={entry.id} {...(onOpen ? { type: "button", onClick: () => onOpen(entry) } : {})}
          aria-label={onOpen ? t("{0}, {1} đến {2}", entry.title, clock(minutesOn(entry, column.date)[0]), clock(minutesOn(entry, column.date)[1])) : undefined}
          style={{ ...toneOf(entry), top: top(from), height: (to - from) / 60 * hourHeight - 2, left: `calc(${lane / lanes * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
          className={`absolute flex flex-col items-start overflow-hidden rounded-lg border-l-[3px] border-[var(--tone)] bg-[color-mix(in_srgb,var(--tone)_20%,var(--surface))] px-1.5 py-1 text-left text-[11px] leading-[1.15] ${onOpen ? "transition-shadow duration-200 hover:z-[1] hover:shadow-lg" : ""}`}>
          <b className="block break-words">{entry.title}</b>
          <span className="text-[var(--muted)]">{clock(minutesOn(entry, column.date)[0])}{entry.place ? ` · ${entry.place}` : ""}</span>
        </Block>)}
        {column.date === today && minute >= first * 60 && minute <= last * 60 && <span aria-hidden className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-[var(--danger)] before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-[var(--danger)]" style={{ top: top(minute) }} />}
      </div>)}
    </div>
  </div>;
}
