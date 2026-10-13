import { localDateTimeKey } from "../../../kernel/dates";
import { t } from "../../../kernel/i18n";

/** What a new event starts from when it is opened from somewhere else: an empty slot, another event, an activity. */
export interface EventSeed {
  /** "YYYY-MM-DD" */
  day: string;
  /** "HH:MM". Without it: the next full hour today, 08:00 on another day. */
  time?: string;
  title?: string;
  place?: string;
  /** How long it lasts. Without it: an hour. */
  minutes?: number;
  /** For an event that takes whole days: its last day. */
  lastDay?: string;
}

export type WhenPreset = "now" | "tonight" | "tomorrow" | "weekend";
export const whenPresets: [WhenPreset, string][] = [["now", t("Bây giờ")], ["tonight", t("Tối nay")], ["tomorrow", t("Ngày mai")], ["weekend", t("Cuối tuần này")]];

/** The lengths offered for one tap, in minutes. */
export const quickDurations: [number, string][] = [[30, t("30 phút")], [60, t("1 giờ")], [120, t("2 giờ")]];

/** Events people add again and again: a name and the usual length. */
export const eventTemplates: { title: string; minutes: number }[] = [
  { title: t("Cà phê"), minutes: 60 },
  { title: t("Ăn tối"), minutes: 90 },
  { title: t("Học bài"), minutes: 120 },
  { title: t("Hẹn hò"), minutes: 120 },
];

const fiveMinutes = 5 * 60_000;
const at = (now: Date, days: number, hour: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour);

/**
 * When a preset starts, as the value of a `datetime-local` field. "Now" is the next five-minute mark.
 * "Tonight" is 19:00, "tomorrow" 09:00 and "this weekend" Saturday 09:00; on the weekend itself it is
 * that day. A time that has already passed today becomes "now".
 */
export function presetStart(preset: WhenPreset, now: Date): string {
  const soon = new Date(Math.ceil(now.getTime() / fiveMinutes) * fiveMinutes);
  const untilSaturday = (6 - now.getDay() + 7) % 7; // 0 on a Saturday
  const start = preset === "now" ? soon
    : preset === "tonight" ? at(now, 0, 19)
    : preset === "tomorrow" ? at(now, 1, 9)
    : at(now, now.getDay() === 0 ? 0 : untilSaturday, 9);
  return localDateTimeKey(start < soon ? soon : start);
}

/** `value` ("YYYY-MM-DDTHH:MM") moved by `minutes`. */
export const shiftMinutes = (value: string, minutes: number) => localDateTimeKey(new Date(new Date(value).getTime() + minutes * 60_000));

/** The newest first, each once, and no more than `limit`: the people and places a person used last. */
export function remember(kept: readonly string[], used: readonly string[], limit: number): string[] {
  return [...new Set([...used.map(item => item.trim()).filter(Boolean), ...kept])].slice(0, limit);
}
