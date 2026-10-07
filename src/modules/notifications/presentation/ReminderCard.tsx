import { AlarmClock } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { notificationsModule } from "../notifications.module";

/** "Remind me at…": the server sends a notification at the chosen time, which opens the screen this card is on. */
export function ReminderCard() {
  const { inbox } = useModule(notificationsModule);
  const { pathname } = useLocation();
  const { run, pending, error } = useAction(["notifications"]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [at, setAt] = useState("");
  const [message, setMessage] = useState("");

  function schedule(event: FormEvent) {
    event.preventDefault();
    const dueAt = new Date(at);
    if (!title.trim() || !Number.isFinite(dueAt.getTime())) return;
    if (dueAt <= new Date()) { setMessage("Thời gian nhắc phải ở tương lai."); return; }
    setMessage("");
    run(() => inbox.scheduleReminder({ dueAt, title, body, actionPath: pathname }), () => {
      setTitle(""); setBody(""); setAt("");
      setMessage("Đã lưu nhắc việc. Tới giờ, nó sẽ hiện trong Thông báo.");
    });
  }

  return <Card title="Nhắc việc">
    <form onSubmit={schedule} className="space-y-3">
      <label className="grid gap-1 text-sm font-semibold">Nội dung nhắc<input className="field w-full" value={title} onChange={event => setTitle(event.target.value)} placeholder="Nội dung nhắc" maxLength={200} required /></label>
      <label className="grid gap-1 text-sm font-semibold">Ghi chú (tùy chọn)<textarea className="field min-h-20 w-full" value={body} onChange={event => setBody(event.target.value)} placeholder="Ghi chú thêm" /></label>
      <label className="grid gap-1 text-sm font-semibold">Thời gian nhắc<input className="field w-full" type="datetime-local" value={at} onChange={event => setAt(event.target.value)} required /></label>
      <Button type="submit" disabled={pending}><AlarmClock size={17} /> {pending ? "Đang lưu…" : "Lên lịch"}</Button>
    </form>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Máy chủ gửi lời nhắc, nên bạn không cần mở ứng dụng. Thông báo đẩy có thể tới chậm hoặc không tới, tùy thiết bị.</p>
  </Card>;
}
