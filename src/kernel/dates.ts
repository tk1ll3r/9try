import { locale, t } from "./i18n";

/** A calendar day in the device's time zone, as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A day and time in the device's time zone, as "YYYY-MM-DDTHH:MM": the value of a `datetime-local` field. */
export function localDateTimeKey(date: Date): string {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const weekdayLetters = [t("T2"), t("T3"), t("T4"), t("T5"), t("T6"), t("T7"), t("CN")];
const weekdayWords = [t("Thứ hai"), t("Thứ ba"), t("Thứ tư"), t("Thứ năm"), t("Thứ sáu"), t("Thứ bảy"), t("Chủ nhật")];
const parts = (day: string) => day.split("-").map(Number);
/** Where a day ("YYYY-MM-DD") falls in its week: 0 for Monday up to 6 for Sunday. */
export function weekdayIndex(day: string): number {
  const [year, month, date] = parts(day);
  return (new Date(year, month - 1, date).getDay() + 6) % 7;
}
/** A month the way a date names it: "tháng 10". `month` is 1 to 12. Asked for with a day, because alone it comes back as a title: "Tháng 10". */
export const monthName = (month: number) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" })
  .formatToParts(new Date(2000, month - 1, 1)).find(part => part.type === "month")!.value;
/** "Thứ năm, 8 tháng 10" */
export const dayTitle = (day: string) => `${weekdayWords[weekdayIndex(day)]}, ${parts(day)[2]} ${monthName(parts(day)[1])}`;

/** The last `count` calendar days on this device, oldest first, ending with today. */
export function lastDays(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, index) => localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - index))));
}

/** Where "now" comes from, so that a test can fix the time. */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
