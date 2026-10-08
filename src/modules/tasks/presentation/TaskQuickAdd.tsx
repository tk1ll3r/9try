import { Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { localDateKey } from "../../../kernel/dates";
import { Button } from "../../../kernel/ui/Button";
import type { TaskPriority } from "../domain/Task";
import { useTaskChange } from "./useTasks";

/** One field to add a task for today. The day, a time and the priority are behind a link, for when they matter. */
export function TaskQuickAdd({ placeholder }: { placeholder: string }) {
  const { run, pending, error } = useTaskChange();
  const id = useId();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(() => localDateKey(new Date()));
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [options, setOptions] = useState(false);

  function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    run(service => service.add({ title, dueDate, dueTime, priority }), () => { setTitle(""); setDueTime(""); });
  }

  return <form onSubmit={add} className="space-y-2">
    <label className="sr-only" htmlFor={`${id}-title`}>Nội dung công việc</label>
    <div className="flex gap-2"><input id={`${id}-title`} className="field min-w-0 flex-1" value={title} onChange={event => setTitle(event.target.value)} placeholder={placeholder} required maxLength={200} />
      <Button type="submit" variant="secondary" disabled={pending} aria-label="Thêm việc"><Plus size={19} /></Button></div>
    <button type="button" aria-expanded={options} onClick={() => setOptions(value => !value)} className="min-h-9 text-xs font-semibold text-[var(--muted)] underline">{options ? "Ẩn ngày, giờ và mức ưu tiên" : "Thêm ngày, giờ, mức ưu tiên"}</button>
    {options && <div className="flex flex-wrap gap-2">
      <input className="field min-w-0 flex-1" type="date" aria-label="Ngày làm" value={dueDate} onChange={event => setDueDate(event.target.value)} />
      <input className="field" type="time" aria-label="Giờ (tùy chọn)" disabled={!dueDate} value={dueTime} onChange={event => setDueTime(event.target.value)} />
      <select className="field" aria-label="Độ ưu tiên" value={priority} onChange={event => setPriority(event.target.value as TaskPriority)}>
        <option value="low">Nhẹ</option><option value="medium">Bình thường</option><option value="high">Quan trọng</option>
      </select>
    </div>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
  </form>;
}
