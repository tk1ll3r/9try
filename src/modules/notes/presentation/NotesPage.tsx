import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { matchesSearch } from "../../../kernel/text";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import type { Note } from "../domain/Note";
import { notesModule } from "../notes.module";

const notesKey = ["notes"] as const;

export function NotesPage() {
  const notes = useModule(notesModule);
  const confirm = useConfirm();
  const list = useQuery({ queryKey: notesKey, queryFn: () => notes.list() });
  const { run, pending, error } = useAction(notesKey);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const problem = error || (list.isError ? errorMessage(list.error, "Không tải được ghi chú.") : "");
  const visible = (list.data ?? []).filter(note => matchesSearch(`${note.title} ${note.body}`, search));
  const name = (note: Note) => note.title || "Không tiêu đề";

  function clear() {
    setEditing(null); setTitle(""); setBody("");
  }
  // The text is cleared only after the server has it, so a failed save loses nothing.
  function save(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() && !body.trim()) return;
    setMessage("");
    run(() => editing ? notes.update(editing, title, body) : notes.create(title, body), () => { clear(); setMessage("Đã lưu ghi chú."); });
  }

  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">Riêng tư, chỉ mình bạn</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Ghi chú</h1>
    </header>

    {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}
    {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

    <div className="grid items-start gap-5 xl:grid-cols-2">
      <Card title={editing ? "Sửa ghi chú" : "Ghi chú mới"}>
        <form onSubmit={save} className="space-y-3" aria-busy={pending}>
          <label className="block text-sm font-semibold" htmlFor="note-title">Tiêu đề ghi chú</label>
          <input id="note-title" className="field w-full" value={title} onChange={event => setTitle(event.target.value)} placeholder="Tiêu đề" maxLength={200} />
          <label className="block text-sm font-semibold" htmlFor="note-body">Nội dung ghi chú</label>
          <textarea id="note-body" className="field min-h-28 w-full resize-y" value={body} onChange={event => setBody(event.target.value)} placeholder="Ghi lại điều bạn không muốn quên…" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || (!title.trim() && !body.trim())}><NotebookPen size={17} /> {pending ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Lưu ghi chú"}</Button>
            {editing && <Button variant="ghost" disabled={pending} onClick={clear}>Hủy sửa</Button>}
          </div>
        </form>
      </Card>

      <Card title={`Ghi chú của bạn · ${list.data?.length ?? 0}`}>
        <input className="field w-full" type="search" aria-label="Tìm ghi chú" placeholder="Tìm ghi chú, gõ không dấu cũng được…" value={search} onChange={event => setSearch(event.target.value)} />
        {list.isPending && <p role="status" className="mt-3">Đang tải ghi chú…</p>}
        <div className="mt-3 space-y-3">
          {visible.map(note => <article key={note.id} className="rounded-2xl bg-[var(--soft)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-bold">{name(note)}</h2>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--muted)]">{note.body}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" disabled={pending} className="min-h-11 rounded-xl px-3 text-sm font-semibold hover:bg-black/5 dark:hover:bg-white/10" aria-label={`Sửa ghi chú ${name(note)}`}
                  onClick={() => { setEditing(note.id); setTitle(note.title); setBody(note.body); document.getElementById("note-title")?.focus(); }}>Sửa</button>
                <button type="button" disabled={pending} className="grid size-11 place-items-center rounded-xl text-[var(--muted)] hover:bg-black/5 dark:hover:bg-white/10" aria-label={`Xóa ghi chú ${name(note)}`}
                  onClick={async () => { if (await confirm({ title: "Xóa ghi chú?", body: `“${name(note)}” sẽ bị xóa. Không thể hoàn tác.`, action: "Xóa ghi chú" })) run(() => notes.remove(note.id), () => { if (editing === note.id) clear(); }); }}><Trash2 size={16} /></button>
              </div>
            </div>
          </article>)}
          {list.isSuccess && !visible.length && <p className="py-6 text-center text-sm text-[var(--muted)]">{list.data.length ? "Không có ghi chú nào khớp." : "Chưa có ghi chú nào."}</p>}
        </div>
      </Card>
    </div>
  </div>;
}
