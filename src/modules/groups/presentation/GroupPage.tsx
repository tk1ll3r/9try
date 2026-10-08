import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowLeft, Copy, Crown, Link2, LogOut, MessageCircle, Share2, ShieldCheck, UserMinus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { Membership } from "../domain/Group";
import { groupsModule } from "../groups.module";
import { roleLabel } from "./GroupsPage";
import { groupsKey, useMyGroups } from "./useGroups";
import { locale, t } from "../../../kernel/i18n";

/** One group: its members, invite links, what the user shares with it, and leaving or archiving. */
export function GroupPage() {
  const { groupId = "" } = useParams();
  const userId = useUserId();
  const groups = useModule(groupsModule);
  const confirm = useConfirm();
  const navigate = useNavigate();
  const group = useMyGroups().data?.find(item => item.id === groupId);
  const members = useQuery({ queryKey: [...groupsKey, "members", groupId], queryFn: () => groups.members(groupId) });
  const me = new Membership(members.data?.find(member => member.userId === userId));
  const invites = useQuery({ queryKey: [...groupsKey, "invites", groupId], queryFn: () => groups.listInvites(groupId), enabled: me.isAdmin });
  const sharing = useQuery({ queryKey: [...groupsKey, "sharing", groupId], queryFn: () => groups.sharesAvailability(groupId) });
  const { run, pending, error } = useAction(groupsKey);
  const [maxUses, setMaxUses] = useState(1);
  const [inviteUrl, setInviteUrl] = useState("");
  const [message, setMessage] = useState("");
  const problem = error || (members.isError ? errorMessage(members.error, t("Không thể tải nhóm.")) : "");

  function act(job: () => Promise<unknown>, success = "", after?: () => void) {
    setMessage("");
    run(job, () => { after?.(); setMessage(success); });
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setMessage(t("Đã sao chép liên kết mời.")); }
    catch { setMessage(t("Không sao chép tự động được. Hãy chọn và sao chép liên kết.")); }
  }

  return (
    <div className="space-y-5">
      <header>
        <Link to="/groups" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--muted)]"><ArrowLeft size={16} /> {t("Quay lại nhóm")}</Link>
        <h1 className="text-4xl font-black tracking-[-.045em]">{group?.name ?? t("Nhóm")}</h1>
        {group?.description && <p className="mt-2 text-[var(--muted)]">{group.description}</p>}
        <Link to={`/chat/group/${groupId}`} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--lime)] px-4 text-sm font-semibold text-[#1d230e]"><MessageCircle size={17} /> {t("Trò chuyện nhóm")}</Link>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={members.isFetching} onClick={() => void members.refetch()}>{t("Thử tải lại")}</Button></div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title={t("Thành viên · {0}", members.data?.length ?? 0)}>
        {members.isPending && <p role="status">{t("Đang tải thành viên…")}</p>}
        <div className="space-y-2">
          {(members.data ?? []).map((member) => (
            <div key={member.userId} className="flex flex-col gap-3 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
              <div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] font-bold text-[var(--paper)]">{member.displayName.slice(0, 1).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{member.displayName}{member.userId === userId ? t(" · Bạn") : ""}</p>
                <p className="text-xs text-[var(--muted)]">{member.username ? `@${member.username}` : t("Chưa có username")} · {roleLabel[member.role]}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {me.canManageRole(member) && <>
                  <Button variant="ghost" className="px-3" disabled={pending} onClick={() => act(() => groups.setRole(groupId, member.userId, member.role === "admin" ? "member" : "admin"))}>
                    <ShieldCheck size={16} /> {member.role === "admin" ? t("Bỏ quản trị") : t("Cho làm quản trị")}
                  </Button>
                  <Button variant="ghost" className="px-3" disabled={pending} onClick={async () => {
                    if (await confirm({ title: t("Chuyển quyền chủ nhóm?"), body: t("{0} sẽ là chủ nhóm. Bạn ở lại nhóm với vai trò quản trị.", member.displayName), action: t("Chuyển quyền"), danger: false })) act(() => groups.transferOwnership(groupId, member.userId), t("Đã chuyển quyền chủ nhóm cho {0}.", member.displayName));
                  }}><Crown size={16} /> {t("Chuyển chủ nhóm")}</Button>
                </>}
                {me.canRemove(member) && <Button variant="ghost" className="px-3" disabled={pending} onClick={async () => {
                  if (await confirm({ title: t("Xóa khỏi nhóm?"), body: t("{0} sẽ không còn là thành viên của nhóm này.", member.displayName), action: t("Xóa khỏi nhóm") })) act(() => groups.removeMember(groupId, member.userId));
                }}><UserMinus size={16} /> {t("Xóa")}</Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {me.isAdmin && (
        <Card title={t("Liên kết mời")} action={<Link2 size={18} className="text-[var(--muted)]" />}>
          <p className="text-sm leading-6 text-[var(--muted)]">{t("Ai có liên kết đều vào được nhóm cho tới khi hết lượt hoặc hết hạn sau 7 ngày. Không đăng liên kết ở nơi công khai.")}</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-sm font-semibold">{t("Số lượt dùng")}
              <select className="field" value={maxUses} onChange={e => setMaxUses(Number(e.target.value))}>
                <option value={1}>{t("1 người")}</option><option value={5}>{t("5 người")}</option><option value={20}>{t("20 người")}</option>
              </select>
            </label>
            <Button variant="secondary" disabled={pending} onClick={() => act(() => groups.createInvite(groupId, maxUses).then(invite => setInviteUrl(`${window.location.origin}/invite/group/${invite.token}`)))}>
              <Link2 size={17} /> {t("Tạo liên kết mời")}
            </Button>
          </div>
          {inviteUrl && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="field min-w-0 flex-1" aria-label={t("Liên kết mời")} readOnly value={inviteUrl} onFocus={e => e.target.select()} />
              <Button variant="secondary" onClick={() => void copyInvite()}><Copy size={17} /> {t("Sao chép")}</Button>
            </div>
          )}
          {(invites.data?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-2">
              {invites.data!.map(invite => (
                <li key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm">
                  <span>{t("Còn {0} lượt · hết hạn {1}", invite.usesLeft, new Date(invite.expiresAt).toLocaleString(locale))}</span>
                  <Button variant="ghost" className="shrink-0" disabled={pending} onClick={() => act(() => groups.revokeInvite(invite.id), t("Đã thu hồi liên kết."))}>{t("Thu hồi")}</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card title={t("Chia sẻ với nhóm")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-[var(--muted)]">{t("Cho thành viên nhóm thấy lúc bạn bận hay rảnh. Tên, mô tả và địa điểm sự kiện không được chia sẻ.")}</p>
          <Button variant={sharing.data ? "secondary" : "ghost"} aria-pressed={!!sharing.data} disabled={pending || sharing.isPending}
            onClick={() => act(() => groups.setAvailabilityShare(groupId, !sharing.data))}>
            <Share2 size={16} /> {sharing.data ? t("Đang chia sẻ bận/rảnh") : t("Chia sẻ bận/rảnh")}
          </Button>
        </div>
      </Card>

      <Card title={t("Rời hoặc lưu trữ")}>
        <div className="flex flex-wrap gap-3">
          {me.canLeave && <Button variant="ghost" disabled={pending} onClick={async () => {
            if (await confirm({ title: t("Rời nhóm?"), body: t("Bạn sẽ không còn thấy nhóm này và cuộc trò chuyện của nhóm. Muốn quay lại, bạn cần một lời mời mới."), action: t("Rời nhóm") })) act(() => groups.leave(groupId), "", () => navigate("/groups"));
          }}><LogOut size={17} /> {t("Rời nhóm")}</Button>}
          {me.isOwner && <Button variant="danger" disabled={pending} onClick={async () => {
            if (await confirm({ title: t("Lưu trữ nhóm?"), body: t("Nhóm sẽ biến mất khỏi danh sách của mọi thành viên."), action: t("Lưu trữ nhóm") })) act(() => groups.archive(groupId), "", () => navigate("/groups"));
          }}><Archive size={17} /> {t("Lưu trữ nhóm")}</Button>}
        </div>
        {me.isOwner && (members.data?.length ?? 0) > 1 && <p className="mt-3 text-xs text-[var(--muted)]">{t("Muốn rời nhóm hoặc xóa tài khoản, hãy chuyển quyền chủ nhóm cho thành viên khác trước.")}</p>}
      </Card>
    </div>
  );
}
