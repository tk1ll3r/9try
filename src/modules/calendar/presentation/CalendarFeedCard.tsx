import { useQuery } from "@tanstack/react-query";
import { Copy, Link2, Link2Off } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { calendarModule } from "../calendar.module";

export const feedKey = ["calendar", "feed"] as const;

/** A private address that Google or Apple Calendar can subscribe to, so this calendar shows up there. */
export function CalendarFeedCard() {
  const calendar = useModule(calendarModule);
  const confirm = useConfirm();
  const feed = useQuery({ queryKey: feedKey, queryFn: () => calendar.feedCreatedAt() });
  const { run, pending, error } = useAction(feedKey);
  const [address, setAddress] = useState("");
  const [message, setMessage] = useState("");

  async function copy() {
    try { await navigator.clipboard.writeText(address); setMessage("Đã sao chép liên kết."); }
    catch { setMessage("Không sao chép tự động được. Hãy chọn và sao chép liên kết."); }
  }

  return <Card title="Xem lịch này trong Google hoặc Apple Calendar" action={<Link2 size={18} className="text-[var(--muted)]" />}>
    <p className="text-sm leading-6 text-[var(--muted)]">Tạo một liên kết riêng rồi dán vào mục “Thêm lịch từ URL” của ứng dụng lịch kia. Lịch ở đó tự cập nhật theo lịch ở đây, thường chậm vài giờ. Ai có liên kết đều đọc được toàn bộ lịch của bạn, kể cả tên sự kiện, nên đừng gửi nó cho người khác.</p>
    {feed.isError && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{errorMessage(feed.error, "Chưa kiểm tra được liên kết lịch.")}</p>}
    {address && <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input className="field min-w-0 flex-1" aria-label="Liên kết lịch" readOnly value={address} onFocus={event => event.target.select()} />
      <Button variant="secondary" onClick={() => void copy()}><Copy size={17} /> Sao chép</Button>
    </div>}
    {address && <p className="mt-2 text-xs text-[var(--muted)]">Liên kết chỉ hiện một lần này. Nếu làm mất, hãy tạo liên kết mới.</p>}
    {!address && feed.data && <p className="mt-3 text-sm">Đang có một liên kết, tạo ngày {new Date(feed.data).toLocaleDateString("vi-VN")}.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant={feed.data ? "ghost" : "secondary"} disabled={pending || feed.isPending} onClick={async () => {
        if (feed.data && !await confirm({ title: "Tạo liên kết mới?", body: "Liên kết cũ sẽ ngừng hoạt động trong các ứng dụng lịch đang dùng nó.", action: "Tạo liên kết mới", danger: false })) return;
        setMessage("");
        run(() => calendar.createFeed(), setAddress);
      }}><Link2 size={17} /> {feed.data ? "Tạo liên kết mới" : "Tạo liên kết lịch"}</Button>
      {feed.data && <Button variant="ghost" disabled={pending} onClick={async () => {
        if (await confirm({ title: "Thu hồi liên kết?", body: "Các ứng dụng lịch đang dùng nó sẽ không đọc được lịch của bạn nữa.", action: "Thu hồi" })) run(() => calendar.revokeFeed(), () => { setAddress(""); setMessage("Đã thu hồi liên kết."); });
      }}><Link2Off size={17} /> Thu hồi</Button>}
    </div>
    {message && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}
