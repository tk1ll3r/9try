import { dayTitle, weekdayLetters, weekdayIndex } from "../dates";

/** One number of the statistics screen, with what it counts under it. */
export function StatTile({ value, label }: { value: string | number; label: string }) {
  return <div className="min-w-0 rounded-2xl bg-[var(--soft)] p-3">
    <p className="truncate text-2xl font-black tabular-nums tracking-tight">{value}</p>
    <p className="text-xs font-semibold leading-4 text-[var(--muted)]">{label}</p>
  </div>;
}

export interface Bar {
  /** Under the bar: "T5", "8". Left empty where there are too many bars to label each. */
  label: string;
  /** What the bar says in words: "Thứ năm, 8 tháng 10: 3 việc". Shown on hover and read by screen readers. */
  title: string;
  /** Stacked from the bottom up. `color` is any CSS color. */
  parts: { value: number; color: string }[];
}

/** A row of bars, one for each day. The tallest bar fills the height; a day with nothing keeps a thin line. */
export function BarChart({ bars, label }: { bars: Bar[]; label: string }) {
  const top = Math.max(1, ...bars.map(bar => bar.parts.reduce((sum, part) => sum + part.value, 0)));
  return <ul aria-label={label} className="flex h-32 items-stretch gap-1">
    {bars.map((bar, index) => <li key={index} title={bar.title} aria-label={bar.title} className="flex min-w-0 flex-1 flex-col justify-end gap-1">
      <span className="flex min-h-0.5 flex-1 flex-col-reverse overflow-hidden rounded-md bg-[color-mix(in_srgb,var(--soft)_70%,transparent)]">
        {bar.parts.map((part, at) => part.value > 0 && <i key={at} style={{ height: `${part.value / top * 100}%`, background: part.color }} />)}
      </span>
      <span aria-hidden className="h-4 truncate text-center text-[10px] font-semibold leading-4 text-[var(--muted)]">{bar.label}</span>
    </li>)}
  </ul>;
}

/**
 * Bars for a run of days ("YYYY-MM-DD"). A week is labeled with the days of the week; a longer run
 * with the day of the month under every fifth bar, counted back from today. `words` says the day's
 * total after its name: "3 việc".
 */
export function dayBars(days: readonly string[], parts: (day: string) => Bar["parts"], words: (day: string) => string): Bar[] {
  return days.map((day, index) => ({
    label: days.length <= 7 ? weekdayLetters[weekdayIndex(day)] : (days.length - 1 - index) % 5 === 0 ? String(Number(day.slice(8))) : "",
    title: `${dayTitle(day)}: ${words(day)}`,
    parts: parts(day),
  }));
}
