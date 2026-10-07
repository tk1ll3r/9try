import { Plus, UsersRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import type { GroupRole } from "../domain/Group";
import { groupsModule } from "../groups.module";
import { groupsKey, useMyGroups } from "./useGroups";

export const roleLabel: Record<GroupRole, string> = { owner: "Chủ nhóm", admin: "Quản trị", member: "Thành viên" };

export function GroupsPage() {
  const groups = useModule(groupsModule);
  const list = useMyGroups();
  const { run, pending, error } = useAction(groupsKey);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const problem = error || (list.isError ? errorMessage(list.error, "Không thể tải nhóm.") : "");

  function create(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    run(() => groups.create(name, description), () => { setName(""); setDescription(""); setMessage("Đã tạo nhóm."); });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Những vòng tròn thân thiết</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Nhóm</h1>
      </header>

      <Card title="Tạo nhóm">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <label className="grid gap-1 text-sm font-semibold">Tên nhóm<input className="field" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên nhóm" /></label>
          <label className="grid gap-1 text-sm font-semibold">Mô tả (tùy chọn)<input className="field" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả" /></label>
          <Button type="submit" disabled={pending}><Plus size={18} /> {pending ? "Đang lưu…" : "Tạo"}</Button>
        </form>
      </Card>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}
      {list.isPending && <p role="status">Đang tải nhóm…</p>}
      {list.data?.length === 0 ? (
        <Card><div className="py-10 text-center text-[var(--muted)]"><UsersRound className="mx-auto mb-2" />Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung.</div></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(list.data ?? []).map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="block rounded-[28px] border border-black/8 bg-[var(--surface)] p-5 shadow-[0_12px_40px_rgba(28,30,22,.05)] hover:-translate-y-0.5 dark:border-white/8">
              <div className="grid size-12 place-items-center rounded-2xl bg-[var(--soft)] text-xl font-black">{group.name[0]?.toUpperCase()}</div>
              <p className="mt-5 text-xl font-bold">{group.name}</p>
              <p className="mt-1 min-h-10 text-sm text-[var(--muted)]">{group.description || "Một nơi để lên lịch cùng nhau."}</p>
              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{group.memberCount} thành viên · {roleLabel[group.role]}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
