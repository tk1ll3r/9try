import { Ban, CalendarDays, Check, Clock3, Search, Share2, UserMinus, UserPlus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { friendsData, type BusyRange, type FriendConnection } from "../infrastructure/FriendsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function FriendsPage() {
  const [items, setItems] = useState<FriendConnection[]>([]);
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyViewer, setBusyViewer] = useState<{ friend: FriendConnection; ranges: BusyRange[] } | null>(null);

  async function refresh() {
    try {
      const [nextItems, nextShares] = await Promise.all([friendsData.list(), friendsData.myAvailabilityShares()]);
      setItems(nextItems);
      setSharedWith(nextShares);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải danh sách bạn bè.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    try {
      await friendsData.send(username);
      setUsername("");
      setMessage("Đã gửi lời mời.");
      await refresh();
    } catch (error) {
      setMessage(humanize(error));
    } finally {
      setBusy(false);
    }
  }

  async function showBusy(friend: FriendConnection) {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    try {
      setBusyViewer({ friend, ranges: await friendsData.busyFor(friend.userId, from, to) });
    } catch {
      setMessage("Người này chưa chia sẻ trạng thái bận/rảnh với bạn.");
    }
  }

  const accepted = useMemo(() => items.filter((item) => item.status === "accepted"), [items]);
  const incoming = useMemo(() => items.filter((item) => item.status === "pending" && item.direction === "incoming"), [items]);
  const outgoing = useMemo(() => items.filter((item) => item.status === "pending" && item.direction === "outgoing"), [items]);

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Kết nối có chủ đích</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Bạn bè</h1>
      </header>

      <Card title="Tìm bằng username">
        <form onSubmit={send} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-[var(--muted)]" size={17} />
            <input className="field w-full pl-10" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username chính xác" required />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}><UserPlus size={17} /> Gửi lời mời</Button>
        </form>
        {message && <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
      </Card>

      {incoming.length > 0 && (
        <Card title={`Đang chờ bạn · ${incoming.length}`}>
          <div className="space-y-2">
            {incoming.map((item) => (
              <PersonRow key={item.userId} item={item} actions={
                <>
                  <Button className="px-3" onClick={async () => { await friendsData.respond(item.userId, true); await refresh(); }}><Check size={16} /> Chấp nhận</Button>
                  <Button variant="ghost" className="px-3" onClick={async () => { await friendsData.respond(item.userId, false); await refresh(); }}><X size={16} /> Từ chối</Button>
                </>
              } />
            ))}
          </div>
        </Card>
      )}

      {outgoing.length > 0 && (
        <Card title={`Đã gửi · ${outgoing.length}`}>
          <div className="space-y-2">
            {outgoing.map((item) => (
              <PersonRow key={item.userId} item={item} actions={
                <Button variant="ghost" onClick={async () => { await friendsData.cancel(item.userId); await refresh(); }}><X size={16} /> Hủy lời mời</Button>
              } />
            ))}
          </div>
        </Card>
      )}

      <Card title={`Bạn bè · ${accepted.length}`}>
        {accepted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Chưa có kết nối nào.</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((item) => {
              const sharing = sharedWith.has(item.userId);
              return (
                <PersonRow key={item.userId} item={item} actions={
                  <>
                    <Link to={`/calendar/shared/${item.userId}`}><Button variant="ghost" className="px-3"><CalendarDays size={16} /> Lịch chia sẻ</Button></Link>
                    <Button variant="ghost" className="px-3" onClick={() => void showBusy(item)}><Clock3 size={16} /> Xem bận/rảnh</Button>
                    <Button
                      variant={sharing ? "secondary" : "ghost"}
                      className="px-3"
                      onClick={async () => { await friendsData.setAvailabilityShare(item.userId, !sharing); await refresh(); }}
                    >
                      <Share2 size={16} /> {sharing ? "Đang chia sẻ bận/rảnh" : "Chia sẻ bận/rảnh"}
                    </Button>
                    <Button variant="ghost" className="px-3" onClick={async () => { await friendsData.remove(item.userId); await refresh(); }}><UserMinus size={16} /> Xóa</Button>
                    <Button variant="ghost" className="px-3" onClick={async () => { await friendsData.block(item.userId); await refresh(); }}><Ban size={16} /> Chặn</Button>
                  </>
                } />
              );
            })}
          </div>
        )}
      </Card>

      {busyViewer && (
        <Card title={`Bận/rảnh 7 ngày tới · ${busyViewer.friend.displayName}`}>
          {busyViewer.ranges.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Không có khoảng bận nào trong 7 ngày tới.</p>
          ) : (
            <div className="space-y-2">
              {busyViewer.ranges.map((range, index) => (
                <div key={index} className="rounded-2xl bg-[var(--soft)] p-3 text-sm font-semibold">
                  {range.eventKind === "all_day"
                    ? `Bận cả ngày · ${range.allDayStart}`
                    : `Bận · ${new Date(range.startAt!).toLocaleString("vi-VN")} → ${new Date(range.endAt!).toLocaleTimeString("vi-VN")}`}
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">Gnouht chỉ hiển thị bận/rảnh; tên, mô tả và địa điểm sự kiện không được trả về.</p>
        </Card>
      )}
    </div>
  );
}

function PersonRow({ item, actions }: { item: FriendConnection; actions: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3 lg:flex-row lg:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">
        {item.displayName.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{item.displayName}</p>
        <p className="text-xs text-[var(--muted)]">{item.username ? `@${item.username}` : "Chưa có username"}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function humanize(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("user not found")) return "Không tìm thấy username này.";
  if (message.includes("already exists")) return "Hai bạn đã có một trạng thái kết nối.";
  return message;
}
