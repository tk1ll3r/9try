import { useQuery } from "@tanstack/react-query";
import { Repeat2, Trash2, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { localDateKey, localDateTimeKey } from "../../../kernel/dates";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { calendarModule } from "../calendar.module";
import { dayTitle, shiftDays } from "../domain/calendarView";
import type { CalendarOccurrence } from "../domain/Occurrence";
import { AudienceFields, audienceProblem, type AudienceChoice } from "./AudienceFields";
import { calendarKey } from "./keys";
import { timeProblem } from "./NewEventDialog";
import { t } from "../../../kernel/i18n";

/**
 * One event, to change or remove. For an event that repeats, the name and the time can be saved for
 * this one time or for every time; the place and the people who see it always belong to all of them.
 * `onDone` gets a sentence that says what happened.
 */
export function EventDialog({ occurrence, open, onOpenChange, onDone }: {
  occurrence: CalendarOccurrence; open: boolean; onOpenChange(open: boolean): void; onDone(message: string): void;
}) {
  const calendar = useModule(calendarModule);
  const confirm = useConfirm();
  const { run, pending, error } = useAction(calendarKey);
  const { eventId, allDay, recurring } = occurrence;
  const firstDay = allDay ? occurrence.start : localDateKey(new Date(occurrence.start));
  const [title, setTitle] = useState(occurrence.title);
  const [start, setStart] = useState(allDay ? occurrence.start : localDateTimeKey(new Date(occurrence.start)));
  const [end, setEnd] = useState(allDay ? shiftDays(occurrence.end, -1) : localDateTimeKey(new Date(occurrence.end)));
  const [place, setPlace] = useState(occurrence.place ?? "");
  const [audience, setAudience] = useState<AudienceChoice>({ visibility: occurrence.visibility, userIds: [], groupId: "" });
  // The people are saved only after the person changed them here; until then the stored ones stand.
  const [audienceChanged, setAudienceChanged] = useState(false);
  const [problem, setProblem] = useState("");

  // The friends or the group an event is shared with are stored apart from the event.
  const stored = useQuery({
    queryKey: [...calendarKey, "audience", eventId],
    queryFn: () => calendar.audience(eventId),
    enabled: open && (occurrence.visibility === "selected_friends" || occurrence.visibility === "group"),
  });
  useEffect(() => {
    if (stored.data && !audienceChanged) setAudience({ visibility: occurrence.visibility, userIds: stored.data.userIds, groupId: stored.data.groupId ?? "" });
  }, [stored.data]);

  /** Saves what belongs to every time the event happens. */
  async function saveShared() {
    if (place.trim() !== (occurrence.place ?? "")) await calendar.setPlace(eventId, place);
    if (audienceChanged) await calendar.setAudience(eventId, occurrence.visibility, audience.visibility, { userIds: audience.userIds, groupId: audience.groupId || null });
  }
  function save(everyTime: boolean) {
    const wrong = timeProblem(allDay, start, end) || (audienceChanged ? audienceProblem(audience) : "");
    setProblem(wrong);
    if (wrong) return;
    run(async () => {
      if (!recurring) await calendar.updateWholeEvent({ eventId, title, allDay, start, end });
      else if (everyTime) await calendar.updateWholeSeriesFromOccurrence({ occurrence, title, start, end });
      else await calendar.editOccurrence({ eventId, occurrenceDate: occurrence.occurrenceDate, title, allDay, start, end });
      await saveShared();
    }, () => { onOpenChange(false); onDone(!recurring ? t("Đã lưu sự kiện.") : everyTime ? t("Đã lưu cho mọi buổi.") : t("Đã lưu riêng buổi này.")); });
  }
  async function skip() {
    if (!await confirm({ title: t("Bỏ buổi này?"), body: t("Buổi {0} sẽ không còn trong lịch. Các buổi khác giữ nguyên.", dayTitle(firstDay)), action: t("Bỏ buổi này") })) return;
    run(() => calendar.skipOccurrence(eventId, occurrence.occurrenceDate), () => { onOpenChange(false); onDone(t("Đã bỏ buổi này khỏi lịch.")); });
  }
  async function remove() {
    if (!await confirm(recurring
      ? { title: t("Xóa mọi buổi?"), body: t("“{0}” sẽ bị xóa ở tất cả các ngày, kể cả những buổi đã qua. Không thể hoàn tác.", occurrence.title), action: t("Xóa mọi buổi") }
      : { title: t("Xóa sự kiện?"), body: t("“{0}” sẽ bị xóa khỏi lịch. Không thể hoàn tác.", occurrence.title), action: t("Xóa sự kiện") })) return;
    run(() => calendar.deleteWholeEvent(eventId), () => { onOpenChange(false); onDone(recurring ? t("Đã xóa mọi buổi.") : t("Đã xóa sự kiện.")); });
  }

  const field = allDay ? "date" : "datetime-local";
  // Whole phrases for a class and for an event: a language may put the words in another order.
  const isClass = occurrence.category === "class";
  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title={isClass ? t("Sửa lớp học") : t("Sửa sự kiện")}
    description={`${dayTitle(firstDay)}${!recurring ? "" : isClass ? t(" · lớp học này lặp lại") : t(" · sự kiện này lặp lại")}`}>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); save(false); }} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-semibold md:col-span-2">{isClass ? t("Tên lớp học") : t("Tên sự kiện")}
        <input className="field" required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? t("Ngày bắt đầu") : t("Bắt đầu")}
        <input className="field" type={field} required value={start} onChange={event => setStart(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? t("Ngày cuối") : t("Kết thúc")}
        <input className="field" type={field} required value={end} onChange={event => setEnd(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{t("Địa điểm (tùy chọn)")}
        <input className="field" maxLength={80} value={place} onChange={event => setPlace(event.target.value)} placeholder={t("Phòng, quán, địa chỉ…")} />
      </label>
      <AudienceFields value={audience} onChange={next => { setAudience(next); setAudienceChanged(true); }} />
      {recurring && <p className="text-xs leading-5 text-[var(--muted)] md:col-span-2">{t("Tên và giờ lưu được cho riêng buổi này hoặc cho mọi buổi. Địa điểm và người được xem luôn áp dụng cho mọi buổi.")}</p>}
      {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)] md:col-span-2">{problem || error}</p>}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? t("Đang lưu…") : recurring ? t("Lưu riêng buổi này") : t("Lưu")}</Button>
        {recurring && <Button variant="secondary" disabled={pending} onClick={() => save(true)}><Repeat2 size={17} /> {t("Lưu cho mọi buổi")}</Button>}
        {recurring && <Button variant="ghost" disabled={pending} onClick={() => void skip()}><XCircle size={17} /> {t("Bỏ buổi này")}</Button>}
        <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={() => void remove()}><Trash2 size={17} /> {recurring ? t("Xóa mọi buổi") : t("Xóa sự kiện")}</Button>
      </div>
    </form>
  </DialogPanel>;
}
