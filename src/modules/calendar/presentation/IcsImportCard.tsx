import { FileUp } from "lucide-react";
import { useState } from "react";
import { useModule } from "../../../kernel/session";
import { calendarModule } from "../calendar.module";
import { parseIcs, type IcsEvent } from "../domain/ics";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { locale, t } from "../../../kernel/i18n";

export function IcsImportCard({ onImported }: { onImported(): Promise<void> }) {
  const calendar = useModule(calendarModule);
  const [preview, setPreview] = useState<{ events: IcsEvent[]; skipped: number } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function select(file?: File) {
    setPreview(null);
    setMessage("");
    if (!file) return;
    if (file.size > 2_000_000) { setMessage(t("File .ics phải nhỏ hơn 2 MB.")); return; }
    try {
      const result = parseIcs(await file.text());
      setPreview(result);
      if (!result.events.length) setMessage(t("Không có sự kiện đơn hợp lệ để nhập. Sự kiện lặp hiện chưa được hỗ trợ."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("Không thể đọc file .ics."));
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
      setMessage(t("Đã nhập {0} sự kiện riêng tư.{1}", imported, alreadyThere ? t(" Bỏ qua {0} sự kiện đã có từ lần nhập trước.", alreadyThere) : ""));
    } catch (error) {
      setPreview({ ...preview, events: preview.events.slice(imported + alreadyThere) });
      setMessage(t("Đã nhập {0} sự kiện; dừng khi gặp lỗi: {1}. Có thể thử lại phần còn lại.", imported, error instanceof Error ? error.message : t("không xác định")));
    } finally {
      await onImported();
      setBusy(false);
    }
  }

  return <Card title={t("Nhập lịch .ics")} action={<FileUp size={19} className="text-[var(--muted)]" />}>
    <p className="mb-3 text-sm text-[var(--muted)]">{t("Chọn file từ Google/Apple Calendar. Xem trước rồi mới lưu; tất cả sự kiện nhập vào mặc định chỉ mình bạn thấy.")}</p>
    <input aria-label={t("Chọn file lịch .ics")} type="file" accept=".ics,text/calendar" className="block w-full text-sm" onChange={(e) => void select(e.currentTarget.files?.[0])} />
    {preview && <div className="mt-4 rounded-2xl bg-[var(--soft)] p-4 text-sm">
      <p className="font-semibold">{t("{0} sự kiện sẵn sàng · {1} bỏ qua (lặp, hủy, trùng trong file hoặc không hợp lệ)", preview.events.length, preview.skipped)}</p>
      <ul className="mt-2 max-h-36 list-inside list-disc overflow-y-auto text-[var(--muted)]">{preview.events.map((event) => <li key={event.uid}>{event.title} · {event.kind === "all_day" ? event.start : new Date(event.start).toLocaleString(locale)}</li>)}</ul>
      <p className="mt-2 text-xs">{t("Sự kiện lặp và ngoại lệ không được nhập, để tránh sai lịch. Nhập lại cùng file không tạo bản sao.")}</p>
      {preview.events.length > 0 && <Button className="mt-3" disabled={busy} onClick={() => void importEvents()}><FileUp size={16} /> {busy ? t("Đang nhập…") : t("Nhập {0} sự kiện", preview.events.length)}</Button>}
    </div>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </Card>;
}
