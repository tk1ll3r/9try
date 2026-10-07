import { Ban, CalendarDays, Check, Clock3, Search, Share2, UserMinus, UserPlus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { friendsData, type BusyRange, type FriendConnection } from "../infrastructure/FriendsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

export function FriendsPage() {
  const { user } = useAuth();
  const scope = useRef(new AsyncOwnerScope());
  const lock = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<FriendConnection[]>([]);
  const [sharedWith, setSharedWith] = useState<Set<string>>(new Set());
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyViewer, setBusyViewer] = useState<{ friend: FriendConnection; ranges: BusyRange[] } | null>(null);

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try {
      const [nextItems, nextShares] = await Promise.all([friendsData.list(), friendsData.myAvailabilityShares()]);
      if (current()) { setItems(nextItems); setSharedWith(nextShares); setError(""); }
    } catch (cause) {
      if (current()) setError(humanize(cause));
    } finally { if (current()) setLoading(false); }
  }

  useEffect(() => {
    scope.current.activate(user?.id); lock.current = false;
    setItems([]); setSharedWith(new Set()); setBusyViewer(null); setUsername(""); setMessage(""); setError(""); setLoading(true); setBusy(false);
    void refresh();
    return () => scope.current.dispose();
  }, [user?.id]);

  async function act(action: () => Promise<void>, success?: string, after?: () => void) {
    if (!user || lock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    lock.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await action();
      if (!current()) return;
      after?.();
      await refresh();
      if (current() && success) setMessage(success);
    } catch (cause) {
      if (current()) setError(humanize(cause));
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;
    await act(() => friendsData.send(username), "Đã gửi lời mời.", () => setUsername(""));
  }

  async function showBusy(friend: FriendConnection) {
    if (!user) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    setError("");
    try {
      const ranges = await friendsData.busyFor(friend.userId, from, to);
      if (current()) setBusyViewer({ friend, ranges });
    } catch {
      if (current()) setError("Người này chưa chia sẻ trạng thái bận/rảnh với bạn.");
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
            <label className="sr-only" htmlFor="friend-username">Username người bạn muốn mời</label>
            <input id="friend-username" className="field w-full pl-10" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username chính xác" required />
          </div>
          <Button type="submit" variant="secondary" disabled={busy}><UserPlus size={17} /> Gửi lời mời</Button>
        </form>
        {message && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error} <Button variant="ghost" disabled={loading} onClick={() => void refresh()}>Thử tải lại</Button></p>}
      </Card>

      {loading && !items.length && <p role="status">Đang tải bạn bè…</p>}

      {incoming.length > 0 && (
        <Card title={`Đang chờ bạn · ${incoming.length}`}>
          <div className="space-y-2">
            {incoming.map((item) => (
              <PersonRow key={item.userId} item={item} actions={
                <>
                  <Button disabled={busy} className="px-3" onClick={() => void act(() => friendsData.respond(item.userId, true))}><Check size={16} /> Chấp nhận</Button>
                  <Button disabled={busy} variant="ghost" className="px-3" onClick={() => void act(() => friendsData.respond(item.userId, false))}><X size={16} /> Từ chối</Button>
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
                <Button disabled={busy} variant="ghost" onClick={() => void act(() => friendsData.cancel(item.userId))}><X size={16} /> Hủy lời mời</Button>
              } />
            ))}
          </div>
        </Card>
      )}

      <Card title={`Bạn bè · ${accepted.length}`}>
        {!loading && !error && accepted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Chưa có kết nối nào.</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((item) => {
              const sharing = sharedWith.has(item.userId);
              return (
                <PersonRow key={item.userId} item={item} actions={
                  <>
                    <Link to={`/calendar/shared/${item.userId}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--surface)]"><CalendarDays size={16} /> Lịch chia sẻ</Link>
                    <Button disabled={busy} variant="ghost" className="px-3" onClick={() => void showBusy(item)}><Clock3 size={16} /> Xem bận/rảnh</Button>
                    <Button
                      variant={sharing ? "secondary" : "ghost"}
                      className="px-3"
                      disabled={busy}
                      aria-pressed={sharing}
                      onClick={() => void act(() => friendsData.setAvailabilityShare(item.userId, !sharing))}
                    >
                      <Share2 size={16} /> {sharing ? "Đang chia sẻ bận/rảnh" : "Chia sẻ bận/rảnh"}
                    </Button>
                    <Button disabled={busy} variant="ghost" className="px-3" onClick={() => {
                      if (window.confirm(`Xóa ${item.displayName} khỏi danh sách bạn bè?`)) void act(() => friendsData.remove(item.userId), undefined, () => setBusyViewer(null));
                    }}><UserMinus size={16} /> Xóa</Button>
                    <Button disabled={busy} variant="ghost" className="px-3" onClick={() => {
                      if (window.confirm(`Chặn ${item.displayName}? Bạn sẽ không còn kết nối với người này.`)) void act(() => friendsData.block(item.userId), undefined, () => setBusyViewer(null));
                    }}><Ban size={16} /> Chặn</Button>
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
  const message = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message
    : "Không thể thực hiện thao tác. Hãy thử lại.";
  if (message.includes("user not found")) return "Không tìm thấy username này.";
  if (message.includes("already exists")) return "Hai bạn đã có một trạng thái kết nối.";
  return message;
}
