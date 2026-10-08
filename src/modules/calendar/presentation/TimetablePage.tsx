import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { calendarModule } from "../calendar.module";
import { parseTimetable, weekdayNames, type ClassDraft } from "../domain/timetable";
import { calendarKey } from "./keys";
import { locale, t } from "../../../kernel/i18n";

const inFourMonths = () => { const date = new Date(); date.setMonth(date.getMonth() + 4); return localDateKey(date); };

/** The weekly classes of a term. Each class is a weekly event, so it also shows in the calendar and counts as busy. */
export function TimetablePage() {
  const calendar = useModule(calendarModule);
  const confirm = useConfirm();
  const classes = useQuery({ queryKey: [...calendarKey, "classes"], queryFn: () => calendar.listClasses() });
  const { run, pending, error } = useAction(calendarKey);
  const [termStart, setTermStart] = useState(() => localDateKey(new Date()));
  const [termEnd, setTermEnd] = useState(inFourMonths);
  const [draft, setDraft] = useState<ClassDraft>({ title: "", weekday: 1, start: "07:30", end: "09:30", place: "" });
  const [pasted, setPasted] = useState("");
  const [message, setMessage] = useState("");
  const parsed = parseTimetable(pasted);
  const problem = error || (classes.isError ? errorMessage(classes.error, t("Không tải được thời khóa biểu.")) : "");

  function addOne(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (draft.start >= draft.end) { setMessage(t("Giờ kết thúc phải sau giờ bắt đầu.")); return; }
    run(() => calendar.createClass(draft, termStart, termEnd), () => { setDraft({ ...draft, title: "", place: "" }); setMessage(t("Đã thêm lớp.")); });
  }

  function addPasted() {
    setMessage("");
    run(async () => { for (const item of parsed.classes) await calendar.createClass(item, termStart, termEnd); },
      () => { setPasted(""); setMessage(t("Đã thêm {0} lớp.", parsed.classes.length)); });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">{t("Lớp học lặp lại mỗi tuần trong học kỳ")}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Thời khóa biểu")}</h1>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem}</div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title={t("Học kỳ")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{t("Ngày bắt đầu")}<input className="field" type="date" required value={termStart} onChange={event => setTermStart(event.target.value)} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t("Ngày kết thúc")}<input className="field" type="date" required min={termStart} value={termEnd} onChange={event => setTermEnd(event.target.value)} /></label>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">{t("Các lớp thêm bên dưới lặp lại mỗi tuần trong khoảng này.")}</p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title={t("Thêm một lớp")}>
          <form onSubmit={addOne} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold sm:col-span-2">{t("Môn học")}<input className="field" required maxLength={200} value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} placeholder={t("Ví dụ: Cấu trúc dữ liệu")} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Thứ")}<select className="field" value={draft.weekday} onChange={event => setDraft({ ...draft, weekday: Number(event.target.value) })}>
              {weekdayNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
            </select></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Phòng (tùy chọn)")}<input className="field" maxLength={80} value={draft.place} onChange={event => setDraft({ ...draft, place: event.target.value })} placeholder="B1.02" /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Bắt đầu")}<input className="field" type="time" required value={draft.start} onChange={event => setDraft({ ...draft, start: event.target.value })} /></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Kết thúc")}<input className="field" type="time" required value={draft.end} onChange={event => setDraft({ ...draft, end: event.target.value })} /></label>
            <div className="sm:col-span-2"><Button type="submit" disabled={pending}><Plus size={17} /> {pending ? t("Đang lưu…") : t("Thêm lớp")}</Button></div>
          </form>
        </Card>

        <Card title={t("Dán cả thời khóa biểu")}>
          <label className="grid gap-1 text-sm font-semibold">{t("Mỗi dòng một lớp")}
            <textarea className="field min-h-32 font-mono text-sm" value={pasted} onChange={event => setPasted(event.target.value)} placeholder={t("T2 07:30-09:45 Cấu trúc dữ liệu @ B1.02\nT5 13:00-15:15 Toán rời rạc")} />
          </label>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("Thứ viết T2 đến T7 hoặc CN. Phòng sau dấu @ là tùy chọn.")}</p>
          {pasted.trim() && <p className="mt-2 text-sm">{t("{0} lớp đọc được{1}.", parsed.classes.length, parsed.rejected.length ? t(", {0} dòng không đọc được: {1}", parsed.rejected.length, parsed.rejected.join(" · ")) : "")}</p>}
          <Button className="mt-3" variant="secondary" disabled={pending || !parsed.classes.length} onClick={addPasted}><Plus size={17} /> {t("Thêm")} {parsed.classes.length || ""} {t("lớp")}</Button>
        </Card>
      </div>

      <Card title={t("Các lớp · {0}", classes.data?.length ?? 0)} action={<GraduationCap size={18} className="text-[var(--muted)]" />}>
        {classes.isPending && <p role="status">{t("Đang tải thời khóa biểu…")}</p>}
        {classes.data?.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">{t("Chưa có lớp nào. Thêm từng lớp hoặc dán cả thời khóa biểu ở trên.")}</p>}
        <div className="space-y-4">
          {weekdayNames.map((name, index) => {
            const day = (classes.data ?? []).filter(item => item.weekday === index + 1).sort((a, b) => a.start.localeCompare(b.start));
            return day.length > 0 && <section key={name}>
              <h2 className="mb-2 text-sm font-bold text-[var(--muted)]">{name}</h2>
              <ul className="space-y-2">{day.map(item => <li key={item.id} className="flex items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
                <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">{item.start}–{item.end}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span>
                  <span className="text-xs text-[var(--muted)]">{[item.place, item.until && t("đến {0}", new Date(`${item.until}T00:00:00`).toLocaleDateString(locale))].filter(Boolean).join(" · ")}</span></span>
                <Button variant="ghost" className="shrink-0 px-3" disabled={pending} aria-label={t("Xóa lớp {0}", item.title)} onClick={async () => {
                  if (await confirm({ title: t("Xóa lớp học?"), body: t("“{0}” sẽ rời thời khóa biểu, cùng mọi buổi của lớp này trong lịch.", item.title), action: t("Xóa lớp") })) run(() => calendar.deleteWholeEvent(item.id));
                }}><Trash2 size={16} /></Button>
              </li>)}</ul>
            </section>;
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{t("Nghỉ hoặc dời một buổi: mở")} <Link className="font-semibold underline" to="/calendar">{t("Lịch")}</Link>{t(", bấm vào buổi đó rồi chọn “Bỏ buổi này” hoặc sửa giờ. Bạn bè được bạn chia sẻ bận/rảnh sẽ thấy giờ học là lúc bận, không thấy tên môn.")}</p>
      </Card>
    </div>
  );
}
