import { Copy, Link2, Plus, UsersRound } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { groupsData, type GroupSummary } from "../infrastructure/GroupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

export function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef(new AsyncOwnerScope());

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try {
      const nextGroups = await groupsData.list(user.id);
      if (current()) { setGroups(nextGroups); setError(""); }
    } catch (cause) {
      if (current()) setError(groupError(cause, "Không thể tải nhóm."));
    } finally { if (current()) setLoading(false); }
  }

  useEffect(() => {
    scope.current.activate(user?.id); lock.current = false;
    setGroups([]); setInviteUrl(""); setMessage(""); setError(""); setLoading(true); setBusy(false);
    void refresh();
    return () => scope.current.dispose();
  }, [user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user || lock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    lock.current = true; setBusy(true); setError("");
    try {
      await groupsData.create(name, description);
      if (!current()) return;
      setName(""); setDescription("");
      await refresh();
      if (current()) setMessage("Đã tạo nhóm.");
    } catch (cause) {
      if (current()) setError(groupError(cause, "Không thể tạo nhóm. Nội dung vẫn còn để thử lại."));
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  }

  async function makeInvite(groupId: string) {
    if (!user || lock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    lock.current = true; setBusy(true); setError(""); setInviteUrl(""); setMessage("");
    try {
      const invite = await groupsData.createInvite(groupId, 1, 10080);
      if (!current()) return;
      setInviteUrl(`${window.location.origin}/invite/group/${invite.token}`);
      setMessage(`Liên kết dùng 1 lần, hết hạn ${new Date(invite.expiresAt).toLocaleString("vi-VN")}.`);
    } catch (cause) {
      if (current()) setError(groupError(cause, "Không thể tạo lời mời."));
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage("Đã sao chép liên kết mời."); }
    catch { setError("Không thể sao chép tự động. Hãy chọn và sao chép liên kết bên trên."); }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Những vòng tròn thân thiết</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Nhóm</h1>
        </div>
        <Link to="/meetups" className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--lime)] px-4 py-2.5 text-sm font-semibold text-[#1d230e]">Xem hoạt động</Link>
      </header>

      <Card title="Tạo nhóm">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <label className="grid gap-1 text-sm font-semibold">Tên nhóm<input className="field" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm" /></label>
          <label className="grid gap-1 text-sm font-semibold">Mô tả (tùy chọn)<input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả" /></label>
          <Button type="submit" disabled={busy}><Plus size={18} /> {busy ? "Đang lưu…" : "Tạo"}</Button>
        </form>
      </Card>

      {inviteUrl && (
        <Card title="Liên kết mời vừa tạo">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field min-w-0 flex-1" aria-label="Liên kết mời" readOnly value={inviteUrl} onFocus={e => e.target.select()} />
            <Button variant="secondary" onClick={() => void copyInvite()}><Copy size={17} /> Sao chép</Button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Không đăng công khai liên kết này. Người có link có thể dùng quyền mời còn hiệu lực.</p>
        </Card>
      )}

      {error && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error} <Button variant="ghost" disabled={loading} onClick={() => void refresh()}>Thử tải lại</Button></div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}
      {loading && !groups.length && <p role="status">Đang tải nhóm…</p>}
      {!loading && !error && groups.length === 0 ? (
        <Card><div className="py-10 text-center text-[var(--muted)]"><UsersRound className="mx-auto mb-2" />Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung.</div></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <Card key={group.id}>
              <div className="grid size-12 place-items-center rounded-2xl bg-[var(--soft)] text-xl font-black">{group.name[0]?.toUpperCase()}</div>
              <Link to={`/groups/${group.id}`} className="mt-5 block text-xl font-bold hover:underline">{group.name}</Link>
              <p className="mt-1 min-h-10 text-sm text-[var(--muted)]">{group.description || "Một nơi để lên lịch cùng nhau."}</p>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.memberCount} thành viên · {role(group.role)}</span>
                {(group.role === "owner" || group.role === "admin") && (
                  <Button variant="ghost" className="px-3" disabled={busy} onClick={() => void makeInvite(group.id)}><Link2 size={16} /> Mời</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function groupError(cause: unknown, fallback: string): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") return cause.message;
  return fallback;
}

function role(value: GroupSummary["role"]) {
  if (value === "owner") return "Chủ nhóm";
  if (value === "admin") return "Quản trị";
  return "Thành viên";
}
