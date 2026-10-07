export type HabitRepeat = "daily" | "weekly";

/** The longest streak that is counted exactly. Beyond it the screen shows "84+" or "12+". */
export const streakCap = { daily: 84, weekly: 12 } as const;

/** The calendar day at `date` in `timeZone`, as "YYYY-MM-DD". Habits follow the profile's time zone, as the server does. */
export function dateKeyInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function addDays(dayKey: string, days: number): string {
  const day = new Date(`${dayKey}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** The Monday that starts the week of `dayKey`. */
export function mondayOfWeek(dayKey: string): string {
  return addDays(dayKey, -((new Date(`${dayKey}T00:00:00Z`).getUTCDay() + 6) % 7));
}

/** A habit as it stands on `today`, a day in its owner's profile time zone. */
export class Habit {
  constructor(
    readonly id: string,
    readonly title: string,
    readonly repeat: HabitRepeat,
    private readonly doneDays: readonly string[],
    private readonly today: string,
  ) {}

  /** A daily habit is counted per day, a weekly one per Monday–Sunday week. */
  private period(dayKey: string): string {
    return this.repeat === "weekly" ? mondayOfWeek(dayKey) : dayKey;
  }

  /** Done in the period that is running now. */
  get done(): boolean {
    const now = this.period(this.today);
    return this.doneDays.some(day => this.period(day) === now);
  }

  /** Periods done in a row. The running period counts once it is done and does not break the streak before that. */
  get streak(): number {
    const done = new Set(this.doneDays.map(day => this.period(day)));
    const step = this.repeat === "weekly" ? 7 : 1;
    let period = this.period(this.today);
    if (!done.has(period)) period = addDays(period, -step);
    let count = 0;
    for (; done.has(period); period = addDays(period, -step)) count++;
    return count;
  }
}

/** The signed-in user's habits. */
export interface HabitRepository {
  list(): Promise<Habit[]>;
  create(title: string, repeat: HabitRepeat): Promise<void>;
  markDone(id: string): Promise<void>;
  /** Takes back the completion of the running period. */
  undoDone(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}
