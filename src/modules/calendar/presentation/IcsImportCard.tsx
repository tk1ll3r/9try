import { FileUp } from "lucide-react";
import { useState } from "react";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import { parseIcs, type IcsEvent } from "../domain/ics";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";

export function IcsImportCard({ onImported }: { onImported(): Promise<void> }) {
  const calendar = useModule(calendarModule);
  const [preview, setPreview] = useState<{ events: IcsEvent[]; skipped: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function select(file?: File) {
    setPreview(null);
    setMessage("");
    if (!file) return;
    if (file.size > 2_000_000) { setMessage("File .ics phải nhỏ hơn 2 MB."); return; }
    try {
      const result = parseIcs(await file.text());
      setPreview(result);
      if (!result.events.length) setMessage("Không có sự kiện đơn hợp lệ để nhập. Sự kiện lặp hiện chưa được hỗ trợ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể đọc file .ics.");
    }
  }

  async function importEvents() {
    if (!preview?.events.length || busy) return;
    setBusy(true);
    let imported = 0, alreadyThere = 0;
    try {
      for (const event of preview.events) {
        try {
          await calendar.create({
            title: event.title, kind: event.kind, start: event.start, end: event.end,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            visibility: "only_me", recurrence: null, recurrenceUntil: null, externalUid: event.uid,
          });
          imported++;
        } catch (error) {
          // 23505: the database already holds an event with this id from an earlier import.
          if ((error as { code?: string }).code !== "23505") throw error;
          alreadyThere++;
        }
      }
      setPreview(null);
      setMessage(`Đã nhập ${imported} sự kiện riêng tư.${alreadyThere ? ` Bỏ qua ${alreadyThere} sự kiện đã có từ lần nhập trước.` : ""}`);
    } catch (error) {
      setPreview({ ...preview, events: preview.events.slice(imported + alreadyThere) });
      setMessage(`Đã nhập ${imported} sự kiện; dừng khi gặp lỗi: ${error instanceof Error ? error.message : "không xác định"}. Có thể thử lại phần còn lại.`);
    } finally {
      await onImported();
      setBusy(false);
    }
  }

  return <Card title="Nhập lịch .ics" action={<FileUp size={19} className="text-[var(--muted)]" />}>
    <p className="mb-3 text-sm text-[var(--muted)]">Chọn file từ Google/Apple Calendar. Xem trước rồi mới lưu; tất cả sự kiện nhập vào mặc định chỉ mình bạn thấy.</p>
    <input aria-label="Chọn file lịch .ics" type="file" accept=".ics,text/calendar" className="block w-full text-sm" onChange={(e) => void select(e.currentTarget.files?.[0])} />
    {preview && <div className="mt-4 rounded-2xl bg-[var(--soft)] p-4 text-sm">
      <p className="font-semibold">{preview.events.length} sự kiện sẵn sàng · {preview.skipped} bỏ qua (lặp, hủy, trùng trong file hoặc không hợp lệ)</p>
      <ul className="mt-2 max-h-36 list-inside list-disc overflow-y-auto text-[var(--muted)]">{preview.events.map((event) => <li key={event.uid}>{event.title} · {event.kind === "all_day" ? event.start : new Date(event.start).toLocaleString("vi-VN")}</li>)}</ul>
      <p className="mt-2 text-xs">Sự kiện lặp và ngoại lệ không được nhập, để tránh sai lịch. Nhập lại cùng file không tạo bản sao.</p>
      {preview.events.length > 0 && <Button className="mt-3" disabled={busy} onClick={() => void importEvents()}><FileUp size={16} /> {busy ? "Đang nhập…" : `Nhập ${preview.events.length} sự kiện`}</Button>}
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Card>;
}
