import { FileUp } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import { chooseForImport, decodeCalendar, parseIcs, type IcsEvent, type IcsFile } from "../domain/ics";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { locale, t } from "../../../kernel/i18n";

/** How many events of a group the preview names before it only counts the rest. */
const named = 6;

const day = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "numeric", year: "numeric" });
const moment = (value: string) => new Date(value).toLocaleString(locale, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const clock = (value: string) => new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

/** "Hằng tuần · Th 2 07:30–09:30 · đến 30/1/2027" */
function repeatText(event: IcsEvent): string {
  const rule = event.repeat!.rule === "daily" ? t("Hằng ngày") : event.repeat!.rule === "weekly" ? t("Hằng tuần") : t("Hằng tháng");
  const first = event.kind === "all_day" ? t("từ {0}", day(event.start))
    : `${new Date(event.start).toLocaleDateString(locale, event.repeat!.rule === "weekly" ? { weekday: "short" } : { day: "numeric", month: "numeric" })} ${clock(event.start)}–${clock(event.end)}`;
  const skipped = event.repeat!.exceptions.length;
  return [rule, first, event.repeat!.until ? t("đến {0}", day(event.repeat!.until)) : t("không có ngày kết thúc"), skipped ? t("{0} buổi nghỉ hoặc đổi", skipped) : ""].filter(Boolean).join(" · ");
}

/**
 * Reads a calendar file on this device, shows what it holds, and stores it in one request. `classes`
 * starts the card with weekly series going to the timetable, as on the timetable's own screen.
 */
export function IcsImportCard({ onImported, classes = false }: { onImported(): Promise<unknown>; classes?: boolean }) {
  const calendar = useModule(calendarModule);
  const [file, setFile] = useState<IcsFile | null>(null);
  const [skipEnded, setSkipEnded] = useState(true);
  const [asClasses, setAsClasses] = useState(classes);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  async function select(picked?: File) {
    setFile(null); setMessage(""); setProblem("");
    if (!picked) return;
    try {
      setFile(parseIcs(decodeCalendar(new Uint8Array(await picked.arrayBuffer()))));
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : t("Không đọc được file lịch này. Hãy xuất lại file từ ứng dụng lịch rồi thử lần nữa."));
    }
  }

  const picked = file && chooseForImport(file, { skipEnded });
  const singles = picked?.chosen.filter(event => !event.repeat && !event.expanded) ?? [];
  const series = picked?.chosen.filter(event => event.repeat) ?? [];
  const eachTime = picked?.chosen.filter(event => event.expanded) ?? [];
  const leftOut = file && picked ? [
    picked.ended ? t("{0} đã kết thúc", picked.ended) : "",
    file.skipped.cancelled ? t("{0} đã hủy", file.skipped.cancelled) : "",
    file.skipped.duplicate ? t("{0} trùng trong file", file.skipped.duplicate) : "",
    file.skipped.unreadable ? (file.unreadableLines.length
      ? t("{0} không đọc được (bắt đầu ở dòng {1})", file.skipped.unreadable, file.unreadableLines.join(", "))
      : t("{0} không đọc được", file.skipped.unreadable)) : "",
    picked.overLimit ? t("{0} vượt quá 1.000 sự kiện của một lần nhập", picked.overLimit) : "",
  ].filter(Boolean) : [];

  async function importEvents() {
    if (!picked?.chosen.length || busy) return;
    setBusy(true); setProblem("");
    try {
      const done = await calendar.importEvents(picked.chosen, asClasses);
      setFile(null);
      setMessage(done.alreadyThere
        ? t("Đã nhập {0} sự kiện riêng tư. {1} sự kiện đã có từ lần nhập trước nên được giữ nguyên.", done.added, done.alreadyThere)
        : t("Đã nhập {0} sự kiện riêng tư.", done.added));
      await onImported();
    } catch (cause) {
      setProblem(errorMessage(cause, t("Chưa nhập được lịch. Hãy thử lại.")));
    } finally { setBusy(false); }
  }

  const group = "mt-3 rounded-2xl bg-[var(--soft)] p-4 text-sm";
  const list = "mt-2 space-y-1 text-[var(--muted)]";
  const more = (count: number) => count > named && <li>{t("và {0} sự kiện khác", count - named)}</li>;
  const check = "flex min-h-11 items-center gap-3 text-sm";
  return <Card title={t("Nhập lịch .ics")} action={<FileUp size={19} className="text-[var(--muted)]" />}>
    <p className="mb-3 text-sm leading-6 text-[var(--muted)]">{t("Chọn file .ics xuất từ Google Calendar, Apple Calendar, Outlook hoặc trang của trường. File được đọc ngay trên máy này. Bạn xem trước rồi mới lưu, và mọi sự kiện nhập vào chỉ mình bạn thấy.")}</p>
    <input aria-label={t("Chọn file lịch .ics")} type="file" accept=".ics,.ical,.ifb,text/calendar" className="block w-full text-sm" onChange={event => void select(event.currentTarget.files?.[0])} />
    {problem && <p role="alert" className="mt-3 text-sm leading-6 text-[var(--danger)]">{problem}</p>}

    {file && picked && <div aria-label={t("Xem trước file lịch")}>
      {singles.length > 0 && <section className={group}>
        <h3 className="font-semibold">{t("Sự kiện một lần · {0}", singles.length)}</h3>
        <ul className={list}>{singles.slice(0, named).map(event => <li key={event.uid} className="break-words">{event.title} · {event.kind === "all_day" ? day(event.start) : moment(event.start)}</li>)}{more(singles.length)}</ul>
      </section>}
      {series.length > 0 && <section className={group}>
        <h3 className="font-semibold">{t("Lặp lại · {0}", series.length)}</h3>
        <ul className={list}>{series.slice(0, named).map(event => <li key={event.uid} className="break-words"><span className="text-[var(--ink)]">{event.title}</span> · {repeatText(event)}</li>)}{more(series.length)}</ul>
      </section>}
      {eachTime.length > 0 && <section className={group}>
        <h3 className="font-semibold">{t("Lặp theo kiểu khác · {0} lần", eachTime.length)}</h3>
        <p className="mt-1 leading-6 text-[var(--muted)]">{t("{0} chuỗi lặp theo kiểu ứng dụng chưa có (cách tuần, hằng năm, “thứ ba tuần thứ hai”…). Mỗi lần diễn ra từ tháng trước tới 12 tháng tới được nhập thành một sự kiện riêng.", file.expandedSeries)}</p>
      </section>}
      {leftOut.length > 0 && <section className={group}>
        <h3 className="font-semibold">{t("Không nhập")}</h3>
        <ul className={`${list} list-inside list-disc`}>{leftOut.map(line => <li key={line}>{line}</li>)}</ul>
      </section>}
      {!picked.chosen.length && <p role="status" className="mt-3 text-sm">{t("Không có sự kiện nào để nhập.")}{picked.ended ? t(" Bỏ chọn “Bỏ sự kiện đã kết thúc” để nhập cả sự kiện cũ.") : ""}</p>}

      <div className="mt-3 grid gap-1">
        <label className={check}><input type="checkbox" checked={skipEnded} onChange={event => setSkipEnded(event.target.checked)} /> {t("Bỏ sự kiện đã kết thúc")}</label>
        {series.some(event => event.kind === "timed" && event.repeat?.rule === "weekly") && <label className={check}><input type="checkbox" checked={asClasses} onChange={event => setAsClasses(event.target.checked)} /> {t("Lịch lặp hằng tuần là lớp học (hiện ở Thời khóa biểu)")}</label>}
      </div>
      {picked.chosen.length > 0 && <Button className="mt-3" disabled={busy} onClick={() => void importEvents()}><FileUp size={16} /> {busy ? t("Đang nhập…") : t("Nhập {0} sự kiện", picked.chosen.length)}</Button>}
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("Nhập lại cùng file không tạo bản sao và không ghi đè những gì bạn đã sửa trong ứng dụng.")}</p>
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Card>;
}
