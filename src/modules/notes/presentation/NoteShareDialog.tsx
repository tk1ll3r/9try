import { useQuery } from "@tanstack/react-query";
import { Link2, Trash2, UsersRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { useAcceptedFriends } from "../../friends";
import { useMyGroups } from "../../groups";
import type { Note } from "../domain/Note";
import { notesModule } from "../notes.module";
import { notesKey } from "../domain/Note";
import { t } from "../../../kernel/i18n";

/** The owner grants and revokes access for selected friends or whole groups. */
export function NoteShareDialog({ note, open, onOpenChange }: { note: Note | null; open: boolean; onOpenChange(open: boolean): void }) {
  const notes = useModule(notesModule);
  const friends = useAcceptedFriends();
  const groups = useMyGroups();
  const shares = useQuery({ queryKey: [...notesKey, "shares", note?.id], queryFn: () => notes.shares(note!.id), enabled: open && !!note });
  const { run, pending, error } = useAction(notesKey);
  const [users, setUsers] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [permission, setPermission] = useState<"view" | "edit">("view");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setUsers([]); setGroupIds([]); setPermission("view"); setNotice("");
  }, [open, note?.id]);

  function toggle(current: string[], id: string, set: (next: string[]) => void) {
    set(current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!note || (!users.length && !groupIds.length)) return;
    setNotice("");
    run(() => notes.share(note.id, users, groupIds, permission), () => {
      setUsers([]); setGroupIds([]); setNotice(t("Đã cập nhật quyền chia sẻ."));
    });
  }

  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title={t("Chia sẻ ghi chú")} description={t("Chọn bạn bè hoặc nhóm. Thành viên chỉ giữ quyền khi còn trong nhóm.")} size="lg">
    {note && <div className="space-y-5">
      <div className="rounded-2xl bg-[var(--soft)] p-3"><b>{note.title || t("Không tiêu đề")}</b><p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-[var(--muted)]">{note.body}</p></div>
      <form onSubmit={submit} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-bold">{t("Bạn bè")}</legend>
          {friends.length ? <div className="grid gap-2 sm:grid-cols-2">{friends.map(friend => <label key={friend.userId} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-[var(--soft)] p-2.5">
            <input type="checkbox" checked={users.includes(friend.userId)} onChange={() => toggle(users, friend.userId, setUsers)} />
            <Avatar name={friend.displayName} src={friend.avatarUrl} className="size-9 shrink-0 bg-[var(--surface)] text-xs font-black" />
            <span className="min-w-0 truncate text-sm font-semibold">{friend.displayName}</span>
          </label>)}</div> : <p className="text-sm text-[var(--muted)]">{t("Bạn chưa có bạn bè được kết nối.")}</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-bold">{t("Nhóm")}</legend>
          {groups.data?.length ? <div className="grid gap-2 sm:grid-cols-2">{groups.data.map(group => <label key={group.id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
            <input type="checkbox" checked={groupIds.includes(group.id)} onChange={() => toggle(groupIds, group.id, setGroupIds)} />
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface)]"><UsersRound size={17} /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{group.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{t("{0} người", group.memberCount)}</span>
          </label>)}</div> : <p className="text-sm text-[var(--muted)]">{groups.isPending ? t("Đang tải nhóm…") : t("Bạn chưa tham gia nhóm nào.")}</p>}
        </fieldset>
        <label className="block text-sm font-semibold">{t("Quyền truy cập")}
          <select className="field mt-1 w-full" value={permission} onChange={event => setPermission(event.target.value as "view" | "edit")}>
            <option value="view">{t("Có thể xem")}</option><option value="edit">{t("Có thể sửa")}</option>
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
        {notice && <p role="status" className="text-sm text-[var(--muted)]">{notice}</p>}
        <Button type="submit" disabled={pending || (!users.length && !groupIds.length)}><Link2 size={17} /> {pending ? t("Đang chia sẻ…") : t("Chia sẻ")}</Button>
      </form>

      <section className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 text-sm font-bold">{t("Đang chia sẻ với")}</h3>
        {shares.isPending && <p role="status" className="text-sm text-[var(--muted)]">{t("Đang tải quyền chia sẻ…")}</p>}
        {shares.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(shares.error, t("Chưa tải được quyền chia sẻ."))}</p>}
        {shares.isSuccess && !shares.data.length && <p className="text-sm text-[var(--muted)]">{t("Chưa chia sẻ ghi chú này.")}</p>}
        <ul className="space-y-2">{shares.data?.map(share => <li key={share.id} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] p-2">
          {share.targetKind === "person" ? <Avatar name={share.targetName} src={share.avatarUrl} className="size-9 shrink-0 bg-[var(--surface)] text-xs font-black" /> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--surface)]"><UsersRound size={17} /></span>}
          <span className="min-w-0 flex-1"><b className="block truncate text-sm">{share.targetName}</b><span className="block text-xs text-[var(--muted)]">{share.permission === "edit" ? t("Có thể sửa") : t("Chỉ xem")} · {share.targetKind === "person" ? t("Bạn bè") : t("Nhóm")}</span></span>
          <button type="button" aria-label={t("Thu hồi quyền của {0}", share.targetName)} disabled={pending} onClick={() => run(() => notes.revokeShare(share.id))} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--danger)]"><Trash2 size={16} /></button>
        </li>)}</ul>
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("Chia sẻ với nhóm tự cập nhật theo thành viên hiện tại của nhóm.")}</p>
      </section>
    </div>}
  </DialogPanel>;
}
