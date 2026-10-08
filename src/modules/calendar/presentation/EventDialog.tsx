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
    }, () => { onOpenChange(false); onDone(!recurring ? "Đã lưu sự kiện." : everyTime ? "Đã lưu cho mọi buổi." : "Đã lưu riêng buổi này."); });
  }
  async function skip() {
    if (!await confirm({ title: "Bỏ buổi này?", body: `Buổi ${dayTitle(firstDay)} sẽ không còn trong lịch. Các buổi khác giữ nguyên.`, action: "Bỏ buổi này" })) return;
    run(() => calendar.skipOccurrence(eventId, occurrence.occurrenceDate), () => { onOpenChange(false); onDone("Đã bỏ buổi này khỏi lịch."); });
  }
  async function remove() {
    if (!await confirm(recurring
      ? { title: "Xóa mọi buổi?", body: `“${occurrence.title}” sẽ bị xóa ở tất cả các ngày, kể cả những buổi đã qua. Không thể hoàn tác.`, action: "Xóa mọi buổi" }
      : { title: "Xóa sự kiện?", body: `“${occurrence.title}” sẽ bị xóa khỏi lịch. Không thể hoàn tác.`, action: "Xóa sự kiện" })) return;
    run(() => calendar.deleteWholeEvent(eventId), () => { onOpenChange(false); onDone(recurring ? "Đã xóa mọi buổi." : "Đã xóa sự kiện."); });
  }

  const field = allDay ? "date" : "datetime-local";
  const what = occurrence.category === "class" ? "lớp học" : "sự kiện";
  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title={`Sửa ${what}`}
    description={`${dayTitle(firstDay)}${recurring ? ` · ${what} này lặp lại` : ""}`}>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); save(false); }} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-semibold md:col-span-2">Tên {what}
        <input className="field" required maxLength={240} value={title} onChange={event => setTitle(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? "Ngày bắt đầu" : "Bắt đầu"}
        <input className="field" type={field} required value={start} onChange={event => setStart(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">{allDay ? "Ngày cuối" : "Kết thúc"}
        <input className="field" type={field} required value={end} onChange={event => setEnd(event.target.value)} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Địa điểm (tùy chọn)
        <input className="field" maxLength={80} value={place} onChange={event => setPlace(event.target.value)} placeholder="Phòng, quán, địa chỉ…" />
      </label>
      <AudienceFields value={audience} onChange={next => { setAudience(next); setAudienceChanged(true); }} />
      {recurring && <p className="text-xs leading-5 text-[var(--muted)] md:col-span-2">Tên và giờ lưu được cho riêng buổi này hoặc cho mọi buổi. Địa điểm và người được xem luôn áp dụng cho mọi buổi.</p>}
      {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)] md:col-span-2">{problem || error}</p>}
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" disabled={pending}>{pending ? "Đang lưu…" : recurring ? "Lưu riêng buổi này" : "Lưu"}</Button>
        {recurring && <Button variant="secondary" disabled={pending} onClick={() => save(true)}><Repeat2 size={17} /> Lưu cho mọi buổi</Button>}
        {recurring && <Button variant="ghost" disabled={pending} onClick={() => void skip()}><XCircle size={17} /> Bỏ buổi này</Button>}
        <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={() => void remove()}><Trash2 size={17} /> {recurring ? "Xóa mọi buổi" : "Xóa sự kiện"}</Button>
      </div>
    </form>
  </DialogPanel>;
}
