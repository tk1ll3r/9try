import { CalendarDays, Check, Send, ShieldOff, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends } from "../../friends";
import { calendarModule } from "../calendar.module";
import { answerProblem, defaultAnswer, detailNames, expiryChoices, grantSummary, statusNames, type ScheduleAnswer, type ScheduleDetail, type ScheduleRequest } from "../domain/ScheduleSharing";
import { calendarKey } from "./keys";
import { useScheduleSharing } from "./useScheduleSharing";
import { locale, t } from "../../../kernel/i18n";

const face = "size-11 shrink-0 bg-[var(--ink)] font-bold text-[var(--paper)]";
const when = (instant: string) => new Date(instant).toLocaleDateString(locale, { day: "numeric", month: "numeric" });

/**
 * Who asked to see the user's schedule, who may see it now, and whose schedule the user may see.
 * A question is answered here: no, or yes with what is shown, for which days, and until when.
 */
export function ScheduleRequestsPage() {
  const calendar = useModule(calendarModule);
  const friends = useAcceptedFriends();
  const { requests, grants, problem } = useScheduleSharing();
  const { run, pending, error } = useAction(calendarKey);
  const [askId, setAskId] = useState("");
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  const waiting = requests.filter(item => item.direction === "incoming" && item.status === "pending");
  const asked = requests.filter(item => item.direction === "outgoing");
  const given = grants.filter(item => item.direction === "given");
  const received = grants.filter(item => item.direction === "received");
  const act = (job: () => Promise<unknown>, done = "") => { setNotice(""); run(job, () => setNotice(done)); };

  function ask(event: FormEvent) {
    event.preventDefault();
    if (askId) act(() => calendar.requestSchedule(askId, message), t("Đã gửi câu hỏi. Bạn sẽ nhận thông báo khi có trả lời."));
    setMessage("");
  }

  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">{t("Không ai xem được lịch của bạn cho tới khi bạn đồng ý")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Chia sẻ lịch")}</h1>
    </header>

    {(problem || error) && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error || errorMessage(problem, t("Chưa tải được các yêu cầu xem lịch."))}</div>}
    {notice && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{notice}</div>}

    {waiting.length > 0 && <Card title={t("Đang chờ bạn trả lời · {0}", waiting.length)}>
      <ul className="space-y-3">{waiting.map(item => <li key={item.id}><Question item={item} busy={pending}
        onYes={answer => act(() => calendar.answerScheduleRequest(item.id, answer), t("Đã đồng ý. {0} xem được lịch của bạn trong khoảng đã chọn.", item.name))}
        onNo={() => act(() => calendar.answerScheduleRequest(item.id, null), t("Đã từ chối. {0} không xem được gì thêm.", item.name))} /></li>)}</ul>
    </Card>}

    <Card title={t("Đang xem được lịch của bạn · {0}", given.length)}>
      {given.length ? <ul className="space-y-2">{given.map(item => <li key={item.userId} className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
        <Avatar name={item.name} src={item.avatarUrl} className={face} />
        <p className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><span className="block text-xs text-[var(--muted)]">{grantSummary(item)}</span></p>
        <Button variant="ghost" disabled={pending} onClick={() => act(() => calendar.revokeScheduleGrant(item.userId), t("Đã thu hồi. {0} không còn xem được lịch của bạn.", item.name))}><ShieldOff size={16} /> {t("Thu hồi")}</Button>
      </li>)}</ul> : <p className="text-sm leading-6 text-[var(--muted)]">{t("Chưa ai được xem lịch của bạn theo yêu cầu. Khi một người bạn hỏi, câu hỏi hiện ở đây để bạn đồng ý hoặc từ chối.")}</p>}
    </Card>

    {received.length > 0 && <Card title={t("Lịch bạn được xem · {0}", received.length)}>
      <ul className="space-y-2">{received.map(item => <li key={item.userId}>
        <Link to={`/calendar/shared/${item.userId}`} className="pressable flex items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
          <Avatar name={item.name} src={item.avatarUrl} className={face} />
          <span className="min-w-0 flex-1"><b className="block truncate">{item.name}</b><span className="block text-xs text-[var(--muted)]">{grantSummary(item)}</span></span>
          <CalendarDays size={18} className="shrink-0 text-[var(--muted)]" />
        </Link>
      </li>)}</ul>
    </Card>}

    <Card title={t("Hỏi xem lịch của một người bạn")}>
      <form onSubmit={ask} className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
        <label className="grid gap-1 text-sm font-semibold">{t("Người bạn")}
          <select className="field" required value={askId} onChange={event => setAskId(event.target.value)}>
            <option value="">{t("Chọn bạn")}</option>
            {friends.map(friend => <option key={friend.userId} value={friend.userId}>{friend.displayName}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">{t("Lời nhắn (tùy chọn)")}
          <input className="field" maxLength={200} value={message} onChange={event => setMessage(event.target.value)} placeholder={t("Ví dụ: tuần sau bạn rảnh hôm nào?")} />
        </label>
        <Button type="submit" variant="secondary" disabled={pending || !askId}><Send size={16} /> {t("Gửi câu hỏi")}</Button>
      </form>
      {asked.length > 0 && <ul aria-label={t("Những câu bạn đã hỏi")} className="mt-4 space-y-2 border-t border-[var(--border)] pt-4">{asked.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate"><b>{item.name}</b> <span className="text-[var(--muted)]">· {when(item.createdAt)} · {statusNames[item.status]}</span></span>
        {item.status === "pending" && <Button variant="ghost" className="min-h-11 px-3 py-1.5" disabled={pending} onClick={() => act(() => calendar.cancelScheduleRequest(item.id), t("Đã rút lại câu hỏi."))}>{t("Rút lại")}</Button>}
        {item.status === "accepted" && received.some(grant => grant.userId === item.userId) && <Link to={`/calendar/shared/${item.userId}`} className="font-semibold underline">{t("Xem lịch")}</Link>}
      </li>)}</ul>}
    </Card>
  </div>;
}

/** One question waiting for the owner. A yes without touching anything gives the least: busy times, two weeks, for a week. */
function Question({ item, busy, onYes, onNo }: { item: ScheduleRequest; busy: boolean; onYes(answer: ScheduleAnswer): void; onNo(): void }) {
  const today = localDateKey(new Date());
  const [answer, setAnswer] = useState(() => defaultAnswer(today));
  const problem = answerProblem(answer, today);
  const group = `detail-${item.id}`;
  return <article aria-label={t("Yêu cầu của {0}", item.name)} className="rounded-2xl bg-[var(--soft)] p-3">
    <div className="flex items-center gap-3">
      <Avatar name={item.name} src={item.avatarUrl} className={face} />
      <p className="min-w-0 flex-1"><b className="block truncate">{t("{0} muốn xem lịch của bạn", item.name)}</b>
        {item.message && <span className="block break-words text-sm text-[var(--muted)]">“{item.message}”</span>}</p>
    </div>
    <fieldset disabled={busy} className="mt-3 grid gap-3">
      <legend className="sr-only">{t("Nếu đồng ý, {0} thấy gì", item.name)}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(detailNames) as ScheduleDetail[]).map(detail => <label key={detail} className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${answer.detail === detail ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--surface)]"}`}>
          <input type="radio" name={group} className="size-4" checked={answer.detail === detail} onChange={() => setAnswer({ ...answer, detail })} /> {detailNames[detail]}
        </label>)}
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{answer.detail === "busy"
        ? t("Họ thấy lúc nào bạn bận, không thấy bạn bận việc gì.")
        : t("Họ thấy tên và giờ của mọi sự kiện trong những ngày này, kể cả sự kiện bạn để “Chỉ mình tôi”. Địa điểm và ghi chú không được gửi.")}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm font-semibold">{t("Từ ngày")}<input className="field min-w-0" type="date" required min={today} value={answer.startsOn} onChange={event => setAnswer({ ...answer, startsOn: event.target.value })} /></label>
        <label className="grid gap-1 text-sm font-semibold">{t("Đến ngày")}<input className="field min-w-0" type="date" required min={answer.startsOn} value={answer.endsOn} onChange={event => setAnswer({ ...answer, endsOn: event.target.value })} /></label>
        <label className="col-span-2 grid gap-1 text-sm font-semibold sm:col-span-1">{t("Quyền xem hết hạn sau")}
          <select className="field" value={answer.expiresInDays} onChange={event => setAnswer({ ...answer, expiresInDays: Number(event.target.value) })}>
            {expiryChoices.map(([days, label]) => <option key={days} value={days}>{label}</option>)}
          </select>
        </label>
      </div>
      {problem && <p role="alert" className="text-sm text-[var(--danger)]">{problem}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!problem} onClick={() => onYes(answer)}><Check size={16} /> {t("Đồng ý")}</Button>
        <Button variant="ghost" onClick={onNo}><X size={16} /> {t("Từ chối")}</Button>
      </div>
    </fieldset>
  </article>;
}
