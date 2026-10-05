import { CheckCircle2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { organizerData, type PersonalNote, type RoutineTask } from "../infrastructure/OrganizerData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function OrganizerPage() {
  const { user } = useAuth();
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [routines, setRoutines] = useState<RoutineTask[]>([]);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [routineTitle, setRoutineTitle] = useState("");
  const [recurrence, setRecurrence] = useState<"daily" | "weekly">("daily");
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!user) return;
    try {
      const [nextNotes, nextRoutines] = await Promise.all([
        organizerData.listNotes(user.id),
        organizerData.listRoutines(user.id),
      ]);
      setNotes(nextNotes);
      setRoutines(nextRoutines);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải dữ liệu cá nhân.");
    }
  }

  useEffect(() => { void refresh(); }, [user?.id]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    if (!user || (!noteTitle.trim() && !noteBody.trim())) return;
    await organizerData.createNote(user.id, noteTitle, noteBody);
    setNoteTitle("");
    setNoteBody("");
    await refresh();
  }

  async function addRoutine(event: FormEvent) {
    event.preventDefault();
    if (!user || !routineTitle.trim()) return;
    await organizerData.createRoutine(user.id, routineTitle, recurrence);
    setRoutineTitle("");
    await refresh();
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư, chỉ mình bạn</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Ghi chú & thói quen</h1>
      </header>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Ghi chú">
          <form onSubmit={addNote} className="space-y-3">
            <input className="field w-full" value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Tiêu đề" />
            <textarea className="field min-h-28 w-full resize-y" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Ghi lại điều bạn không muốn quên…" />
            <Button type="submit"><NotebookPen size={17} /> Lưu ghi chú</Button>
          </form>

          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-2xl bg-[var(--soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold">{note.title || "Không tiêu đề"}</h2>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--muted)]">{note.body}</p>
                  </div>
                  <button className="rounded-xl p-2 text-[var(--muted)] hover:bg-black/5" aria-label="Xóa ghi chú" onClick={async () => { await organizerData.deleteNote(note.id); await refresh(); }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
            {notes.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có ghi chú nào.</p>}
          </div>
        </Card>

        <Card title="Thói quen đơn giản">
          <form onSubmit={addRoutine} className="flex flex-col gap-3 sm:flex-row">
            <input className="field min-w-0 flex-1" value={routineTitle} onChange={(e) => setRoutineTitle(e.target.value)} placeholder="Ví dụ: Đọc 20 phút" required />
            <select className="field" value={recurrence} onChange={(e) => setRecurrence(e.target.value as "daily" | "weekly")}>
              <option value="daily">Mỗi ngày</option>
              <option value="weekly">Mỗi tuần</option>
            </select>
            <Button type="submit" variant="secondary"><Plus size={17} /> Thêm</Button>
          </form>

          <div className="mt-5 space-y-2">
            {routines.map((routine) => (
              <button
                key={routine.id}
                className="flex w-full items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-left"
                onClick={async () => { await organizerData.markRoutineDone(routine.id); await refresh(); }}
              >
                <CheckCircle2 size={20} className={routine.completedAt ? "text-emerald-600" : "text-[var(--muted)]"} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{routine.title}</span>
                  <span className="text-xs text-[var(--muted)]">{routine.recurrence === "daily" ? "Mỗi ngày" : "Mỗi tuần"}</span>
                </span>
              </button>
            ))}
            {routines.length === 0 && <p className="py-6 text-center text-sm text-[var(--muted)]">Chưa có thói quen định kỳ.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
