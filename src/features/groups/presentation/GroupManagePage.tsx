import { Archive, ArrowLeft, Crown, LogOut, UserMinus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { groupsData, type GroupMember, type GroupSummary } from "../infrastructure/GroupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function GroupManagePage() {
  const { groupId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!user || !groupId) return;
    try {
      const [groups, nextMembers] = await Promise.all([groupsData.list(user.id), groupsData.members(groupId)]);
      setGroup(groups.find((item) => item.id === groupId) ?? null);
      setMembers(nextMembers);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải nhóm.");
    }
  }

  useEffect(() => { void refresh(); }, [user?.id, groupId]);

  const me = useMemo(() => members.find((member) => member.userId === user?.id), [members, user?.id]);
  const canRemove = me?.role === "owner" || me?.role === "admin";

  if (!group && !message) return <div className="py-20 text-center text-[var(--muted)]">Đang tải nhóm…</div>;

  return (
    <div className="space-y-5">
      <header>
        <Link to="/groups" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft size={16} /> Quay lại nhóm</Link>
        <h1 className="text-4xl font-black tracking-[-.045em]">{group?.name ?? "Nhóm"}</h1>
        <p className="mt-2 text-[var(--muted)]">{group?.description}</p>
      </header>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title={`Thành viên · ${members.length}`}>
        <div className="space-y-2">
          {members.map((member) => (
            <div key={member.userId} className="flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">
                {member.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{member.displayName} {member.userId === user?.id ? "· Bạn" : ""}</p>
                <p className="text-xs text-[var(--muted)]">{member.username ? `@${member.username}` : "Chưa có username"} · {role(member.role)}</p>
              </div>

              {me?.role === "owner" && member.role !== "owner" && (
                <Button variant="ghost" className="px-3" onClick={async () => {
                  await groupsData.transferOwnership(groupId, member.userId);
                  setMessage(`Đã chuyển quyền sở hữu cho ${member.displayName}.`);
                  await refresh();
                }}><Crown size={16} /> Chuyển owner</Button>
              )}

              {canRemove && member.userId !== user?.id && member.role !== "owner" && !(me?.role === "admin" && member.role === "admin") && (
                <Button variant="ghost" className="px-3" onClick={async () => {
                  await groupsData.removeMember(groupId, member.userId);
                  await refresh();
                }}><UserMinus size={16} /> Xóa</Button>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Quản lý nhóm">
        <div className="flex flex-wrap gap-3">
          {me?.role !== "owner" && <Button variant="ghost" onClick={async () => { await groupsData.leave(groupId); navigate("/groups"); }}><LogOut size={17} /> Rời nhóm</Button>}
          {me?.role === "owner" && <Button variant="danger" onClick={async () => { await groupsData.archive(groupId); navigate("/groups"); }}><Archive size={17} /> Lưu trữ nhóm</Button>}
        </div>
        {me?.role === "owner" && members.length > 1 && <p className="mt-3 text-xs text-[var(--muted)]">Nếu muốn rời nhóm hoặc xóa tài khoản, hãy chuyển quyền sở hữu cho thành viên khác trước.</p>}
      </Card>
    </div>
  );
}

function role(value: GroupMember["role"]) {
  if (value === "owner") return "Chủ sở hữu";
  if (value === "admin") return "Quản trị viên";
  return "Thành viên";
}
