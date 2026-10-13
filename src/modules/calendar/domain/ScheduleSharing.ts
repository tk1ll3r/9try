import { locale, t } from "../../../kernel/i18n";
import { shiftDays, type CalendarEntry } from "./calendarView";

/** What a permission shows: when the owner is busy, or also what each event is called. */
export type ScheduleDetail = "busy" | "details";
export type RequestStatus = "pending" | "accepted" | "declined" | "cancelled" | "expired";

/** A question "may I see your schedule?", asked by the signed-in user ("outgoing") or asked of them ("incoming"). */
export interface ScheduleRequest {
  id: string;
  direction: "incoming" | "outgoing";
  /** The other person. */
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: RequestStatus;
  message: string;
  createdAt: string;
}

/** A permission that holds now: one the signed-in user gave ("given") or one they got ("received"). */
export interface ScheduleGrant {
  direction: "given" | "received";
  userId: string;
  name: string;
  avatarUrl: string | null;
  detail: ScheduleDetail;
  /** The days that may be seen, "YYYY-MM-DD", both included. */
  startsOn: string;
  endsOn: string;
  expiresAt: string;
}

/** The owner's yes. */
export interface ScheduleAnswer {
  detail: ScheduleDetail;
  startsOn: string;
  endsOn: string;
  expiresInDays: number;
}

/** One time something happens in a schedule the user was allowed to see. Without a name it only says "busy". */
export interface GrantedOccurrence {
  eventId: string;
  occurrenceDate: string;
  title: string | null;
  allDay: boolean;
  /** An instant, or a day when `allDay`. */
  start: string;
  end: string;
  category: "event" | "class";
}

/** A plain yes: busy times only, two weeks from today, for a week. The owner widens it if they want to. */
export const defaultAnswer = (today: string): ScheduleAnswer => ({ detail: "busy", startsOn: today, endsOn: shiftDays(today, 13), expiresInDays: 7 });

export const expiryChoices: [days: number, label: string][] = [[1, t("1 ngày")], [7, t("7 ngày")], [30, t("30 ngày")], [90, t("90 ngày")]];
export const detailNames: Record<ScheduleDetail, string> = { busy: t("Chỉ lúc bận"), details: t("Cả tên sự kiện") };
export const statusNames: Record<RequestStatus, string> = {
  pending: t("Đang chờ"), accepted: t("Đã đồng ý"), declined: t("Đã từ chối"), cancelled: t("Đã rút lại"), expired: t("Đã hết hạn"),
};

/** What is wrong with a yes as filled in, or "". The server checks the same. */
export function answerProblem(answer: ScheduleAnswer, today: string): string {
  if (!answer.startsOn || !answer.endsOn) return t("Hãy chọn ngày bắt đầu và ngày kết thúc.");
  if (answer.endsOn < answer.startsOn) return t("Ngày cuối phải bằng hoặc sau ngày bắt đầu.");
  if (answer.endsOn < today) return t("Khoảng ngày này đã qua.");
  if (answer.endsOn > shiftDays(answer.startsOn, 180)) return t("Mỗi lần chia sẻ tối đa 180 ngày.");
  return "";
}

const dayMonth = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric" });
/** "Chỉ lúc bận · 8/10 – 21/10 · hết hạn 15/10". */
export const grantSummary = (grant: ScheduleGrant) =>
  t("{0} · {1} – {2} · hết hạn {3}", detailNames[grant.detail], dayMonth(grant.startsOn), dayMonth(grant.endsOn), new Date(grant.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "numeric" }));

/** How the calendar draws what a permission shows: a named event in its own color, anything else as "busy". */
export function entryOfGranted(item: GrantedOccurrence): CalendarEntry {
  return {
    id: `granted:${item.eventId}:${item.occurrenceDate}`, title: item.title ?? t("Bận"), allDay: item.allDay, start: item.start, end: item.end,
    tone: item.title === null ? "busy" : item.category === "class" ? "class" : "event",
  };
}
