import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarDays, Check, Clock3, Copy, Link2, Search, Share2, UserMinus, UserPlus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import type { BusyRange, FriendConnection } from "../domain/Friend";
import { friendsModule } from "../friends.module";
import { friendsKey, useFriendConnections } from "./useFriends";

export function FriendsPage() {
  const friends = useModule(friendsModule);
  const connections = useFriendConnections();
  const shares = useQuery({ queryKey: [...friendsKey, "shares"], queryFn: () => friends.availabilitySharedWith() });
  const blocked = useQuery({ queryKey: [...friendsKey, "blocked"], queryFn: () => friends.listBlocked() });
  const { run, pending, error } = useAction(friendsKey);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busyViewer, setBusyViewer] = useState<{ friend: FriendConnection; ranges: BusyRange[] } | null>(null);

  const items = connections.data ?? [];
  const accepted = items.filter(item => item.status === "accepted");
  const incoming = items.filter(item => item.status === "pending" && item.direction === "incoming");
  const outgoing = items.filter(item => item.status === "pending" && item.direction === "outgoing");
  const sharedWith = shares.data ?? new Set<string>();
  const loading = connections.isPending;
  const problem = error || (connections.isError ? errorMessage(connections.error, "Không thể tải bạn bè.") : "");

  function act(job: () => Promise<unknown>, success = "", after?: () => void) {
    setMessage("");
    run(job, () => { after?.(); setMessage(success); });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (username.trim()) act(() => friends.sendRequest(username), "Đã gửi lời mời.", () => setUsername(""));
  }

  function showBusy(friend: FriendConnection) {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    run(() => friends.busyFor(friend.userId, from, to), ranges => setBusyViewer({ friend, ranges }));
  }

  async function copyInvite() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.url); setMessage("Đã sao chép liên kết."); }
    catch { setMessage("Không sao chép tự động được. Hãy chọn và sao chép liên kết."); }
  }

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
          <Button type="submit" variant="secondary" disabled={pending}><UserPlus size={17} /> Gửi lời mời</Button>
        </form>
        {message && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
        {problem && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={connections.isFetching} onClick={() => void connections.refetch()}>Thử tải lại</Button></p>}
      </Card>

      <Card title="Mời bằng liên kết" action={<Link2 size={18} className="text-[var(--muted)]" />}>
        <p className="text-sm leading-6 text-[var(--muted)]">Ai mở liên kết này khi đã đăng nhập sẽ thành bạn của bạn, không cần bạn duyệt. Chỉ gửi cho người bạn tin. Liên kết có hạn 7 ngày, và tạo liên kết mới sẽ hủy liên kết cũ.</p>
        {invite ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="field min-w-0 flex-1" aria-label="Liên kết kết bạn" readOnly value={invite.url} onFocus={e => e.target.select()} />
              <Button variant="secondary" onClick={() => void copyInvite()}><Copy size={17} /> Sao chép</Button>
              {"share" in navigator && <Button variant="ghost" onClick={() => void navigator.share({ title: "Kết bạn trên Gnouht Together", url: invite.url }).catch(() => undefined)}><Share2 size={17} /> Chia sẻ</Button>}
            </div>
            <p className="text-xs text-[var(--muted)]">Hết hạn {new Date(invite.expiresAt).toLocaleString("vi-VN")}.</p>
          </div>
        ) : (
          <Button className="mt-3" variant="secondary" disabled={pending}
            onClick={() => run(() => friends.createInvite(), result => setInvite({ url: `${window.location.origin}/invite/friend/${result.token}`, expiresAt: result.expiresAt }))}>
            <Link2 size={17} /> Tạo liên kết kết bạn
          </Button>
        )}
      </Card>

      {loading && <p role="status">Đang tải bạn bè…</p>}

      {incoming.length > 0 && (
        <Card title={`Đang chờ bạn · ${incoming.length}`}>
          <div className="space-y-2">
            {incoming.map((item) => (
              <PersonRow key={item.userId} name={item.displayName} username={item.username} actions={
                <>
                  <Button disabled={pending} className="px-3" onClick={() => act(() => friends.respond(item.userId, true))}><Check size={16} /> Chấp nhận</Button>
                  <Button disabled={pending} variant="ghost" className="px-3" onClick={() => act(() => friends.respond(item.userId, false))}><X size={16} /> Từ chối</Button>
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
              <PersonRow key={item.userId} name={item.displayName} username={item.username} actions={
                <Button disabled={pending} variant="ghost" onClick={() => act(() => friends.cancelRequest(item.userId))}><X size={16} /> Hủy lời mời</Button>
              } />
            ))}
          </div>
        </Card>
      )}

      <Card title={`Bạn bè · ${accepted.length}`}>
        {!loading && !problem && accepted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Chưa có kết nối nào.</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((item) => {
              const sharing = sharedWith.has(item.userId);
              return (
                <PersonRow key={item.userId} name={item.displayName} username={item.username} actions={
                  <>
                    <Link to={`/calendar/shared/${item.userId}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold hover:bg-[var(--surface)]"><CalendarDays size={16} /> Lịch chia sẻ</Link>
                    <Button disabled={pending} variant="ghost" className="px-3" onClick={() => showBusy(item)}><Clock3 size={16} /> Xem bận/rảnh</Button>
                    <Button variant={sharing ? "secondary" : "ghost"} className="px-3" disabled={pending} aria-pressed={sharing}
                      onClick={() => act(() => friends.setAvailabilityShare(item.userId, !sharing))}>
                      <Share2 size={16} /> {sharing ? "Đang chia sẻ bận/rảnh" : "Chia sẻ bận/rảnh"}
                    </Button>
                    <Button disabled={pending} variant="ghost" className="px-3" onClick={() => {
                      if (window.confirm(`Xóa ${item.displayName} khỏi danh sách bạn bè?`)) act(() => friends.remove(item.userId), "", () => setBusyViewer(null));
                    }}><UserMinus size={16} /> Xóa</Button>
                    <Button disabled={pending} variant="ghost" className="px-3" onClick={() => {
                      if (window.confirm(`Chặn ${item.displayName}? Bạn sẽ không còn kết nối với người này.`)) act(() => friends.block(item.userId), "", () => setBusyViewer(null));
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

      {(blocked.data?.length ?? 0) > 0 && (
        <Card title={`Đã chặn · ${blocked.data!.length}`}>
          <div className="space-y-2">
            {blocked.data!.map(person => (
              <PersonRow key={person.userId} name={person.displayName} username={person.username} actions={
                <Button disabled={pending} variant="ghost" onClick={() => act(() => friends.unblock(person.userId), "Đã bỏ chặn. Hai bạn chưa là bạn bè trở lại.")}>Bỏ chặn</Button>
              } />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PersonRow({ name, username, actions }: { name: string; username: string | null; actions: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3 lg:flex-row lg:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">{name}</p>
        <p className="text-xs text-[var(--muted)]">{username ? `@${username}` : "Chưa có username"}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
