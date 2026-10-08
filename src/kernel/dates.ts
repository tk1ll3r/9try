/** A calendar day in the device's time zone, as "YYYY-MM-DD". */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** A day and time in the device's time zone, as "YYYY-MM-DDTHH:MM": the value of a `datetime-local` field. */
export function localDateTimeKey(date: Date): string {
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
