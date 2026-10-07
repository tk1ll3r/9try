import { AlarmClock, CheckCircle2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { organizerData, type PersonalNote, type RoutineTask } from "../infrastructure/OrganizerData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { TaskListCard } from "../../../modules/tasks";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

export function OrganizerPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [routines, setRoutines] = useState<RoutineTask[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const noteLock = useRef(false);
  const scope = useRef(new AsyncOwnerScope());
  const [routineTitle, setRoutineTitle] = useState("");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly">("daily");
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderBody, setReminderBody] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [routineBusy, setRoutineBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const otherLock = useRef(false);

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    try {
      const [nextNotes, nextRoutines] = await Promise.all([
        organizerData.listNotes(user.id),
        organizerData.listRoutines(user.id),
      ]);
      if (current()) { setNotes(nextNotes); setRoutines(nextRoutines); setError(""); }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Không thể tải dữ liệu cá nhân.");
    }
  }

  useEffect(() => {
    scope.current.activate(user?.id);
    noteLock.current = false; otherLock.current = false;
    setNotes([]); setRoutines([]); setNoteBusy(false); setRoutineBusy(false); setReminderBusy(false);
    setEditingNote(null); setNoteTitle(""); setNoteBody(""); setRoutineTitle(""); setReminderTitle(""); setReminderBody(""); setReminderAt(""); setMessage(""); setError("");
    void refresh();
    return () => scope.current.dispose();
  }, [user?.id]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!user || noteLock.current || (!noteTitle.trim() && !noteBody.trim())) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    noteLock.current = true; setNoteBusy(true); setError(""); setMessage("");
    try {
      if (editingNote) await organizerData.updateNote(user.id, editingNote, noteTitle, noteBody);
      else await organizerData.createNote(user.id, noteTitle, noteBody);
      if (!current()) return;
      setEditingNote(null); setNoteTitle(""); setNoteBody("");
      await refresh();
      if (current()) setMessage("Đã lưu ghi chú.");
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Không thể lưu ghi chú. Nội dung vẫn còn để thử lại.");
    } finally { if (current()) { noteLock.current = false; setNoteBusy(false); } }
  }

  async function removeNote(id: string) {
    if (!user || noteLock.current || !window.confirm("Xóa ghi chú này? Không thể hoàn tác.")) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    noteLock.current = true; setNoteBusy(true); setError(""); setMessage("");
    try {
      await organizerData.deleteNote(user.id, id);
      if (current()) { if (editingNote === id) { setEditingNote(null); setNoteTitle(""); setNoteBody(""); } await refresh(); }
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Không thể xóa ghi chú.");
    } finally { if (current()) { noteLock.current = false; setNoteBusy(false); } }
  }

  async function addRoutine(event: FormEvent) {
    event.preventDefault();
    if (!user || otherLock.current || !routineTitle.trim()) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    otherLock.current = true; setRoutineBusy(true); setError(""); setMessage("");
    try {
      await organizerData.createRoutine(user.id, routineTitle, recurrence);
      if (!current()) return;
      setRoutineTitle(""); await refresh();
      if (current()) setMessage("Đã thêm thói quen.");
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Không thể thêm thói quen."); }
    finally { if (current()) { otherLock.current = false; setRoutineBusy(false); } }
  }

  async function markDone(id: string) {
    if (!user || otherLock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    otherLock.current = true; setRoutineBusy(true); setError("");
    try {
      await organizerData.markRoutineDone(id);
      if (current()) await refresh();
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : "Không thể ghi nhận hôm nay."); }
    finally { if (current()) { otherLock.current = false; setRoutineBusy(false); } }
  }

  async function scheduleReminder(event: FormEvent) {
    event.preventDefault();
    if (!user || otherLock.current || !reminderAt || !reminderTitle.trim()) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    const dueAt = new Date(reminderAt);
    if (!Number.isFinite(dueAt.getTime()) || dueAt <= new Date()) { setError("Thời gian nhắc phải ở tương lai."); return; }
    otherLock.current = true; setReminderBusy(true); setError(""); setMessage("");
    try {
      await organizerData.scheduleReminder({ dueAt, title: reminderTitle, body: reminderBody });
      if (!current()) return;
      setReminderTitle(""); setReminderBody(""); setReminderAt("");
      setMessage("Đã lưu nhắc việc. Việc gửi phụ thuộc cấu hình xử lý của máy chủ.");
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : "Không thể tạo nhắc việc.");
    } finally { if (current()) { otherLock.current = false; setReminderBusy(false); } }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư, chỉ mình bạn</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Việc, ghi chú & thói quen</h1>
      </header>

      {error && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error} <Button variant="ghost" onClick={() => void refresh()}>Thử tải lại</Button></div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <TaskListCard />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Ghi chú">
          <form onSubmit={addNote} className="space-y-3" aria-busy={noteBusy}>
            <label className="block text-sm font-semibold" htmlFor="note-title">Tiêu đề ghi chú</label>
            <input id="note-title" className="field w-full" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Tiêu đề" maxLength={200} />
            <label className="block text-sm font-semibold" htmlFor="note-body">Nội dung ghi chú</label>
            <textarea id="note-body" className="field min-h-28 w-full resize-y" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Ghi lại điều bạn không muốn quên…" />
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={noteBusy || (!noteTitle.trim() && !noteBody.trim())}><NotebookPen size={17} /> {noteBusy ? "Đang lưu…" : editingNote ? "Lưu thay đổi" : "Lưu ghi chú"}</Button>
              {editingNote && <Button type="button" variant="ghost" disabled={noteBusy} onClick={() => { setEditingNote(null); setNoteTitle(""); setNoteBody(""); }}>Hủy sửa</Button>}
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-2xl bg-[var(--soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold">{note.title || "Không tiêu đề"}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{note.body}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" disabled={noteBusy} className="min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-black/5" aria-label={`Sửa ghi chú ${note.title || "Không tiêu đề"}`} onClick={() => { setEditingNote(note.id); setNoteTitle(note.title); setNoteBody(note.body); document.getElementById("note-title")?.focus(); }}>Sửa</button>
                    <button type="button" disabled={noteBusy} className="grid size-11 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5" aria-label={`Xóa ghi chú ${note.title || "Không tiêu đề"}`} onClick={() => void removeNote(note.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {notes.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có ghi chú nào.</p>}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Thói quen đơn giản">
            <form onSubmit={addRoutine} className="flex flex-col gap-3 sm:flex-row">
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Tên thói quen<input className="field min-w-0" value={routineTitle} onChange={(e) => setRoutineTitle(e.target.value)} placeholder="Ví dụ: Đọc 20 phút" required /></label>
              <label className="grid gap-1 text-sm font-semibold">Tần suất<select className="field" value={recurrence} onChange={(e) => setRecurrence(e.target.value as "daily" | "weekly")}>
                <option value="daily">Mỗi ngày</option>
                <option value="weekly">Mỗi tuần</option>
              </select></label>
              <Button type="submit" variant="secondary" disabled={routineBusy} className="self-end"><Plus size={17} /> {routineBusy ? "Đang lưu…" : "Thêm"}</Button>
            </form>
            <p className="mt-2 text-xs text-[var(--muted)]">Hằng tuần: hoàn thành một lần từ thứ Hai đến Chủ nhật theo múi giờ hồ sơ. Hằng ngày: mỗi ngày một lần.</p>

            <div className="mt-5 space-y-2">
              {routines.map((routine) => (
                <button
                  key={routine.id}
                  disabled={routine.completedInPeriod || routineBusy}
                  className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-left disabled:opacity-60"
                  onClick={() => void markDone(routine.id)}
                >
                  <CheckCircle2 size={20} className={routine.completedInPeriod ? "text-emerald-600" : "text-[var(--muted)]"} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{routine.title}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {routine.completedInPeriod ? routine.recurrence === "weekly" ? "Đã hoàn thành tuần này" : "Đã hoàn thành hôm nay" : routine.recurrence === "daily" ? "Mỗi ngày" : "Mỗi tuần (thứ Hai–Chủ nhật)"}
                    </span>
                  </span>
                </button>
              ))}
              {routines.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có thói quen định kỳ.</p>}
            </div>
          </Card>

          <Card title="Nhắc việc">
            <form onSubmit={scheduleReminder} className="space-y-3">
              <label className="grid gap-1 text-sm font-semibold">Nội dung nhắc<input className="field w-full" value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} placeholder="Nội dung nhắc" required /></label>
              <label className="grid gap-1 text-sm font-semibold">Ghi chú (tùy chọn)<textarea className="field min-h-20 w-full" value={reminderBody} onChange={(e) => setReminderBody(e.target.value)} placeholder="Ghi chú thêm" /></label>
              <label className="grid gap-1 text-sm font-semibold">Thời gian nhắc<input className="field w-full" type="datetime-local" value={reminderAt} onChange={(e) => setReminderAt(e.target.value)} required /></label>
              <Button type="submit" disabled={reminderBusy}><AlarmClock size={17} /> {reminderBusy ? "Đang lưu…" : "Lên lịch"}</Button>
            </form>
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Nhắc việc được xử lý server-side và luôn có bản sao trong trung tâm thông báo. Web push có thể chậm hoặc không tới tùy nền tảng.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
