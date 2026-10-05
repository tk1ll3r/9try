import { Copy, Link2, Plus, UsersRound } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { groupsData, type GroupSummary } from "../infrastructure/GroupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function GroupsPage() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!user) return;
    try {
      setGroups(await groupsData.list(user.id));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải nhóm.");
    }
  }

  useEffect(() => { void refresh(); }, [user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    await groupsData.create(name, description);
    setName("");
    setDescription("");
    await refresh();
  }

  async function makeInvite(groupId: string) {
    try {
      const invite = await groupsData.createInvite(groupId, 1, 10080);
      setInviteUrl(`${window.location.origin}/invite/group/${invite.token}`);
      setMessage(`Liên kết dùng 1 lần, hết hạn ${new Date(invite.expiresAt).toLocaleString("vi-VN")}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo lời mời.");
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Những vòng tròn thân thiết</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Nhóm</h1>
        </div>
        <Link to="/meetups"><Button variant="secondary">Xem hoạt động</Button></Link>
      </header>

      <Card title="Tạo nhóm">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm" />
          <input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả" />
          <Button type="submit"><Plus size={18} /> Tạo</Button>
        </form>
      </Card>

      {inviteUrl && (
        <Card title="Liên kết mời vừa tạo">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="field min-w-0 flex-1" readOnly value={inviteUrl} />
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(inviteUrl)}><Copy size={17} /> Sao chép</Button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">Không đăng công khai liên kết này. Người có link có thể dùng quyền mời còn hiệu lực.</p>
        </Card>
      )}

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      {groups.length === 0 ? (
        <Card><div className="py-10 text-center text-[var(--muted)]"><UsersRound className="mx-auto mb-2" />Chưa có nhóm nào.</div></Card>
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
                  <Button variant="ghost" className="px-3" onClick={() => void makeInvite(group.id)}><Link2 size={16} /> Mời</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function role(value: GroupSummary["role"]) {
  if (value === "owner") return "Chủ nhóm";
  if (value === "admin") return "Quản trị";
  return "Thành viên";
}
