import { useQueryClient } from "@tanstack/react-query";
import { BookPlus } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { featuresKey } from "../../../kernel/features";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { useMyGroups } from "../../groups";
import type { Book, Ledger } from "../domain/Ledger";
import { expensesModule } from "../expenses.module";
import { ExpenseGate } from "./ExpenseGate";
import { chosenBook, expensesKey, useBooks, useLedger } from "./useLedger";
import { t } from "../../../kernel/i18n";

/** What a role is called, for the line under a screen's title and for the list of people. */
export const roleLabel = (role: string) => role === "owner" ? t("chủ sổ") : role === "editor" ? t("được nhập") : t("chỉ xem");

/** A new book: for friends the owner invites afterwards, or for a group the owner is in. */
function CreateBook({ onDone }: { onDone(): void }) {
  const repository = useModule(expensesModule);
  const groups = useMyGroups();
  const { run, pending, error } = useAction(expensesKey);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [groupRole, setGroupRole] = useState<"editor" | "viewer">("editor");
  function create(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) run(() => repository.createBook(name, groupId || null, groupRole), id => { chosenBook.set(id); onDone(); });
  }
  return <form onSubmit={create} className="grid gap-4" aria-busy={pending}>
    <label className="grid gap-1 text-sm font-semibold">{t("Tên sổ")}
      <input className="field" required maxLength={80} data-dialog-initial-focus value={name} onChange={event => setName(event.target.value)} placeholder={t("Ví dụ: Hai đứa, Quỹ lớp, Chuyến Đà Lạt")} />
    </label>
    <label className="grid gap-1 text-sm font-semibold">{t("Sổ này cho ai?")}
      <select className="field" value={groupId} onChange={event => setGroupId(event.target.value)}>
        <option value="">{t("Bạn bè tôi sẽ mời")}</option>
        {(groups.data ?? []).map(group => <option key={group.id} value={group.id}>{t("Nhóm {0}", group.name)}</option>)}
      </select>
    </label>
    {groupId && <label className="grid gap-1 text-sm font-semibold">{t("Thành viên nhóm được làm gì?")}
      <select className="field" value={groupRole} onChange={event => setGroupRole(event.target.value as "editor" | "viewer")}>
        <option value="editor">{t("Xem và nhập khoản chi")}</option><option value="viewer">{t("Chỉ xem")}</option>
      </select>
      <span className="text-xs font-normal leading-5 text-[var(--muted)]">{t("Mọi thành viên của nhóm có mặt trong sổ ngay. Ai vào nhóm sau cũng được vào sổ, ai rời nhóm thì rời sổ.")}</span>
    </label>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <Button type="submit" disabled={pending || !name.trim()}>{pending ? t("Đang tạo…") : t("Tạo sổ")}</Button>
  </form>;
}

/**
 * Above the three screens of the ledger: invitations to answer, the book that is open when the
 * person has more than one, and for an account that may create books, a way to create one.
 */
function BookBar() {
  const repository = useModule(expensesModule);
  const queries = useQueryClient();
  const { mayCreate, open, invitations, book } = useBooks();
  const { run, pending, error } = useAction(expensesKey);
  const [creating, setCreating] = useState(false);
  if (!invitations.length && open.length < 2 && !mayCreate) return null;
  // What the account is shown follows what it is in: after an answer the app asks the server again.
  const answer = (bookId: string, accept: boolean) => run(() => repository.answerInvite(bookId, accept), () => { if (accept) chosenBook.set(bookId); void queries.invalidateQueries({ queryKey: featuresKey }); });
  return <section aria-label={t("Sổ của bạn")} className="space-y-2">
    {invitations.map(invite => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--lime)] p-3 text-sm text-[var(--ink)]">
      <p className="min-w-0 flex-1 leading-6"><b>{t("{0} mời bạn vào sổ “{1}”.", invite.invitedBy || invite.ownerName, invite.name)}</b> {invite.role === "viewer" ? t("Bạn sẽ xem được mọi khoản chi trong sổ.") : t("Bạn sẽ xem và nhập được khoản chi trong sổ.")}</p>
      <span className="flex gap-2"><Button disabled={pending} onClick={() => answer(invite.id, true)}>{t("Vào sổ")}</Button><Button variant="ghost" disabled={pending} onClick={() => answer(invite.id, false)}>{t("Từ chối")}</Button></span>
    </div>)}
    {(open.length > 1 || mayCreate) && <div className="flex flex-wrap items-end gap-2">
      {open.length > 1 && <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--muted)]">{t("Sổ đang mở")}
        <select className="field min-w-0 text-sm font-semibold text-[var(--ink)]" value={book?.id ?? ""} onChange={event => chosenBook.set(event.target.value)}>
          {open.map(item => <option key={item.id} value={item.id}>{item.groupName ? `${item.name} · ${item.groupName}` : item.name}</option>)}
        </select>
      </label>}
      {mayCreate && <Button id="create-book" variant="ghost" className="bg-[var(--soft)]" onClick={() => setCreating(true)}><BookPlus size={17} /> {t("Tạo sổ mới")}</Button>}
    </div>}
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <DialogPanel open={creating} onOpenChange={setCreating} size="sm" returnFocusId="create-book" title={t("Tạo sổ mới")} description={t("Mỗi sổ có khoản chi, người tham gia và lịch sử riêng. Chỉ những người bạn cho vào mới thấy sổ.")}>
      <CreateBook onDone={() => setCreating(false)} />
    </DialogPanel>
  </section>;
}

/** "Hai đứa · 2 người cùng dùng · bạn được nhập", or that the book is the reader's alone. */
export const whoIsIn = (book: Book) => book.memberCount > 1 || book.groupName
  ? t("{0} · {1} người cùng dùng · bạn là {2}", book.groupName ? `${book.name} · ${book.groupName}` : book.name, book.memberCount, roleLabel(book.role))
  : t("Sổ riêng của bạn · chỉ mình bạn xem được");

/**
 * One screen of the ledger: its title, the books to choose from, and the open book once it is
 * loaded. Someone who is in no book yet is told what to do.
 */
export function BookScreen({ title, lead, children }: { title: string; lead?(book: Book): string; children(ledger: Ledger): ReactNode }) {
  return <ExpenseGate><Screen title={title} lead={lead}>{children}</Screen></ExpenseGate>;
}
function Screen({ title, lead = whoIsIn, children }: { title: string; lead?(book: Book): string; children(ledger: Ledger): ReactNode }) {
  const books = useBooks();
  const ledger = useLedger();
  const failed = books.list.isError ? books.list.error : ledger.isError ? ledger.error : null;
  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">{ledger.data ? lead(ledger.data.book) : t("Sổ chi tiêu")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{title}</h1>
    </header>
    <BookBar />
    {(books.list.isPending || (books.book && ledger.isPending)) && <div role="status" aria-label={t("Đang tải sổ chi tiêu")} className="space-y-5"><div className="skeleton h-56" /><div className="skeleton h-24" /></div>}
    {failed && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{errorMessage(failed, t("Chưa tải được sổ chi tiêu."))} <Button variant="ghost" onClick={() => void (books.list.isError ? books.list.refetch() : ledger.refetch())}>{t("Thử tải lại")}</Button></div>}
    {books.list.isSuccess && !books.book && <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--muted)]">{books.invitations.length ? t("Trả lời lời mời ở trên để mở sổ.") : t("Bạn chưa ở trong sổ chi tiêu nào.")}</p>}
    {ledger.data && books.book && children(ledger.data)}
  </div>;
}
