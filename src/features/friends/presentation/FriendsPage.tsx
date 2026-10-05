import { Check, Search, UserMinus, UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { friendsData, type FriendConnection } from "../infrastructure/FriendsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function FriendsPage() {
  const [items, setItems] = useState<FriendConnection[]>([]);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setItems(await friendsData.list());
      setMessage("");
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

      <Card title={`Bạn bè · ${accepted.length}`}>
        {accepted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">Chưa có kết nối nào. Bạn chỉ cần username chính xác của người muốn kết nối.</p>
        ) : (
          <div className="space-y-2">
            {accepted.map((item) => (
              <PersonRow key={item.userId} item={item} actions={
                <Button variant="ghost" className="px-3" onClick={async () => { await friendsData.remove(item.userId); await refresh(); }}><UserMinus size={16} /> Xóa</Button>
              } />
            ))}
          </div>
        )}
      </Card>

      {outgoing.length > 0 && <p className="text-sm text-[var(--muted)]">Bạn đang chờ {outgoing.length} lời mời được phản hồi.</p>}
    </div>
  );
}

function PersonRow({ item, actions }: { item: FriendConnection; actions: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
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
