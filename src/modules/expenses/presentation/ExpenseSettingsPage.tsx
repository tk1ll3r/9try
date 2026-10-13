import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, Plus, Trash2, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { featuresKey } from "../../../kernel/features";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { useAcceptedFriends } from "../../friends";
import { toCsv } from "../domain/csv";
import { describeChange } from "../domain/history";
import { canWrite, type Ledger } from "../domain/Ledger";
import { formatMoney } from "../domain/money";
import { expensesModule } from "../expenses.module";
import { BookScreen, roleLabel } from "./BookBar";
import { categoryIcon } from "./icons";
import { expensesKey } from "./useLedger";
import { locale, t } from "../../../kernel/i18n";

export function ExpenseSettingsPage() {
  return <BookScreen title={t("Sổ và lịch sử")}>{ledger => <Settings key={ledger.book.id} ledger={ledger} />}</BookScreen>;
}

/** The accounts that use the book with its owner: who they are, what each may do, and for the owner the way to let someone in or out. */
function People({ ledger }: { ledger: Ledger }) {
  const repository = useModule(expensesModule);
  const me = useUserId();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const friends = useAcceptedFriends();
  const { book } = ledger;
  const owner = book.role === "owner";
  const { run, pending, error } = useAction(expensesKey);
  const members = useQuery({ queryKey: [...expensesKey, "members", book.id], queryFn: () => repository.members(book.id) });
  const [friendId, setFriendId] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [standsFor, setStandsFor] = useState("");
  const [notice, setNotice] = useState("");
  const inBook = new Set((members.data ?? []).map(member => member.userId));
  const invitable = friends.filter(friend => !inBook.has(friend.userId));
  // A name of the book that no account stands behind yet: an invited friend can take it over, with what it paid.
  const freeNames = book.participants.filter(person => !person.userId && !(members.data ?? []).some(member => member.participantId === person.id));
  const gone = () => { void queries.invalidateQueries({ queryKey: featuresKey }); navigate("/expenses"); };

  function invite(event: FormEvent) {
    event.preventDefault();
    if (!friendId) return;
    setNotice("");
    run(() => repository.invite(book.id, friendId, role, standsFor || null), () => { setFriendId(""); setStandsFor(""); setNotice(t("Đã gửi lời mời. Người ấy thấy sổ sau khi đồng ý.")); });
  }

  return <Card title={t("Người dùng chung sổ · {0}", book.memberCount)}>
    {members.isPending && <p role="status" className="text-sm text-[var(--muted)]">{t("Đang tải…")}</p>}
    {members.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(members.error, t("Chưa tải được danh sách."))}</p>}
    <ul className="space-y-1.5">{members.data?.map(member => <li key={member.userId} className="flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
      <Avatar name={member.name} src={member.avatarUrl} className="size-8 shrink-0 bg-[var(--surface)] text-xs font-black" />
      <span className="min-w-0 flex-1"><b className="block truncate">{member.userId === me ? t("Bạn") : member.name}</b>
        <span className="block text-xs text-[var(--muted)]">{member.status === "invited" ? t("đã mời, chưa trả lời") : roleLabel(member.role)}</span></span>
      {owner && member.role !== "owner" && <>
        {member.status === "active" && <select aria-label={t("Quyền của {0}", member.name)} className="field order-last min-h-9 w-full py-1 text-sm sm:order-none sm:w-auto" disabled={pending} value={member.role}
          onChange={event => {
            // Read now: by the time the change is sent, the field shows the stored role again.
            const next = event.target.value as "editor" | "viewer";
            run(() => repository.setRole(book.id, member.userId, next));
          }}>
          <option value="editor">{t("Xem và nhập khoản chi")}</option><option value="viewer">{t("Chỉ xem")}</option>
        </select>}
        <button type="button" aria-label={member.status === "invited" ? t("Rút lời mời {0}", member.name) : t("Đưa {0} ra khỏi sổ", member.name)} disabled={pending} onClick={async () => {
          if (member.status === "invited" || await confirm({ title: t("Đưa {0} ra khỏi sổ?", member.name), body: t("Người này không xem được sổ nữa. Tên và các khoản đã ghi của họ vẫn ở lại trong sổ."), action: t("Đưa ra khỏi sổ") })) run(() => repository.removeMember(book.id, member.userId));
        }} className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"><Trash2 size={15} /></button>
      </>}
    </li>)}</ul>

    {book.groupName && <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("Đây là sổ của nhóm {0}. Thành viên của nhóm tự có mặt trong sổ; ai rời nhóm thì rời sổ.", book.groupName)}</p>}
    {owner && !book.groupName && <form onSubmit={invite} className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4" aria-busy={pending}>
      <p className="text-sm font-bold">{t("Mời một người bạn vào sổ")}</p>
      {friends.length === 0 ? <p className="text-sm text-[var(--muted)]">{t("Chưa có bạn bè để chọn.")}</p> : <>
        <label className="grid gap-1 text-sm font-semibold">{t("Người được mời")}
          <select className="field" required value={friendId} onChange={event => setFriendId(event.target.value)}>
            <option value="">{t("Chọn bạn")}</option>{invitable.map(friend => <option key={friend.userId} value={friend.userId}>{friend.displayName}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">{t("Người này được")}
            <select className="field" value={role} onChange={event => setRole(event.target.value as "editor" | "viewer")}>
              <option value="editor">{t("Xem và nhập khoản chi")}</option><option value="viewer">{t("Chỉ xem")}</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t("Là ai trong sổ?")}
            <select className="field" value={standsFor} onChange={event => setStandsFor(event.target.value)}>
              <option value="">{t("Một tên mới")}</option>{freeNames.map(person => <option key={person.id} value={person.id}>{t("Chính là “{0}”", person.label)}</option>)}
            </select>
          </label>
        </div>
        {standsFor && <p className="text-xs leading-5 text-[var(--muted)]">{t("Những khoản mà tên này đã trả và đã nợ từ trước sẽ là của người được mời.")}</p>}
        <div><Button type="submit" variant="secondary" disabled={pending || !friendId}><UserPlus size={17} /> {t("Gửi lời mời")}</Button></div>
      </>}
    </form>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}

    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
      {!owner && <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={async () => {
        if (await confirm({ title: t("Rời sổ này?"), body: t("Bạn không xem được sổ nữa. Tên và các khoản bạn đã ghi vẫn ở lại trong sổ."), action: t("Rời sổ") })) run(() => repository.leave(book.id), gone);
      }}><LogOut size={17} /> {t("Rời sổ")}</Button>}
      {owner && <Button variant="ghost" className="text-[var(--danger)]" disabled={pending} onClick={async () => {
        if (await confirm({ title: t("Xóa sổ “{0}”?", book.name), body: t("Mọi khoản chi, lần trả lại và lịch sử của sổ bị xóa với tất cả mọi người. Hãy tải tệp CSV trước nếu cần giữ lại."), action: t("Xóa sổ") })) run(() => repository.deleteBook(book.id), gone);
      }}><Trash2 size={17} /> {t("Xóa sổ này")}</Button>}
    </div>
  </Card>;
}

function Settings({ ledger }: { ledger: Ledger }) {
  const repository = useModule(expensesModule);
  const { book } = ledger;
  const owner = book.role === "owner";
  const writer = canWrite(book.role);
  const { run, pending, error } = useAction(expensesKey);
  // A name without an account is the owner's to word. An account goes by its own name.
  const named = book.participants.filter(person => !person.userId);
  const [names, setNames] = useState(() => Object.fromEntries(named.map(person => [person.id, person.label])));
  const [defaultSplit, setDefaultSplit] = useState(book.defaultSplit);
  const [category, setCategory] = useState("");
  const [notice, setNotice] = useState("");
  const history = useQuery({ queryKey: [...expensesKey, "history", book.id], queryFn: () => repository.history(book.id) });
  const money = (amount: number) => formatMoney(amount, book.currency);
  const act = (job: () => Promise<unknown>, done: string, after?: () => void) => { setNotice(""); run(job, () => { after?.(); setNotice(done); }); };

  function saveNames(event: FormEvent) {
    event.preventDefault();
    act(async () => {
      for (const person of named) if (names[person.id].trim() && names[person.id].trim() !== person.label) await repository.renameParticipant(person.id, names[person.id]);
      if (defaultSplit !== book.defaultSplit) await repository.saveBook(book.id, { name: book.name, defaultSplit });
    }, t("Đã lưu."));
  }
  function addCategory(event: FormEvent) {
    event.preventDefault();
    if (category.trim()) act(() => repository.addCategory(book.id, category, book.categories.length), t("Đã thêm hạng mục."), () => setCategory(""));
  }
  function download() {
    const url = URL.createObjectURL(new Blob([toCsv(ledger)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gnouht-chi-tieu-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(t("Đã tải tệp CSV về máy."));
  }

  return <>
    {notice && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{notice}</div>}
    {error && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <People ledger={ledger} />

      <Card title={t("Tên trong sổ và cách chia")}>
        <p className="text-sm leading-6">{t("Sổ chia khoản chi giữa: {0}.", book.participants.map(person => person.name).join(", "))}</p>
        {owner ? <form onSubmit={saveNames} className="mt-3 grid gap-3" aria-busy={pending}>
          {named.map(person => <label key={person.id} className="grid gap-1 text-sm font-semibold">{book.participants.length === 2 ? t("Tên người ấy") : t("Tên trong sổ")}
            <input className="field" required maxLength={60} value={names[person.id]} onChange={event => setNames({ ...names, [person.id]: event.target.value })} />
          </label>)}
          {named.length > 0 && <p className="text-xs leading-5 text-[var(--muted)]">{t("Một cái tên trong sổ không cho ai quyền xem sổ. Muốn một người cùng dùng sổ, hãy mời họ ở mục “Người dùng chung sổ”.")}</p>}
          <label className="grid gap-1 text-sm font-semibold">{t("Khoản chi mới được chia thế nào?")}
            <select className="field" value={defaultSplit} onChange={event => setDefaultSplit(event.target.value as typeof defaultSplit)}>
              <option value="equal">{t("Chia đều")}</option><option value="payer">{t("Người trả chịu hết")}</option>
            </select>
          </label>
          <div><Button type="submit" disabled={pending}>{pending ? t("Đang lưu…") : t("Lưu")}</Button></div>
        </form> : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("Tên trong sổ và cách chia do chủ sổ đặt.")}</p>}
      </Card>

      <Card title={t("Xuất dữ liệu")}>
        <p className="text-sm leading-6 text-[var(--muted)]">{t("Một tệp CSV có mọi khoản chi và mọi lần trả lại, mở được bằng Excel hoặc Google Sheets. Tệp được tạo trên máy bạn.")}</p>
        <Button className="mt-3" variant="secondary" onClick={download}><Download size={17} /> {t("Tải tệp CSV")}</Button>
      </Card>

      <Card title={t("Hạng mục · {0}", book.categories.length)}>
        <ul className="space-y-1.5">{book.categories.map(item => { const Icon = categoryIcon(item.icon);
          return <li key={item.id} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-1.5 text-sm font-semibold">
            <Icon size={16} className="shrink-0 text-[var(--muted)]" /><span className="min-w-0 flex-1 truncate">{item.name}</span>
            {writer && <button type="button" aria-label={t("Xóa hạng mục {0}", item.name)} disabled={pending} onClick={() => act(() => repository.deleteCategory(item.id), t("Đã xóa hạng mục. Các khoản chi của nó vẫn còn, không xếp hạng mục."))} className="grid size-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"><Trash2 size={15} /></button>}
          </li>; })}</ul>
        {writer && <form onSubmit={addCategory} className="mt-3 flex gap-2">
          <label className="sr-only" htmlFor="new-category">{t("Tên hạng mục mới")}</label>
          <input id="new-category" className="field min-w-0 flex-1" maxLength={40} value={category} onChange={event => setCategory(event.target.value)} placeholder={t("Tên hạng mục mới")} />
          <Button type="submit" variant="secondary" disabled={pending || !category.trim()} aria-label={t("Thêm hạng mục")}><Plus size={17} /></Button>
        </form>}
      </Card>

      <Card title={t("Chuyến đi · {0}", book.outings.length)}>
        {book.outings.length ? <ul className="space-y-1.5">{book.outings.map(outing => {
          const spent = ledger.expenses.filter(expense => expense.outingId === outing.id).reduce((sum, expense) => sum + expense.amount, 0);
          return <li key={outing.id} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-1.5 text-sm">
            <span className="min-w-0 flex-1"><b className="block truncate">{outing.title}</b><span className="block text-xs text-[var(--muted)]">{new Date(`${outing.happenedOn}T00:00:00`).toLocaleDateString(locale)} · {money(spent)}</span></span>
            {writer && <button type="button" aria-label={t("Xóa chuyến đi {0}", outing.title)} disabled={pending} onClick={() => act(() => repository.deleteOuting(outing.id), t("Đã xóa chuyến đi. Các khoản chi của nó vẫn còn."))} className="grid size-9 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--surface)]"><Trash2 size={15} /></button>}
          </li>; })}</ul> : <p className="text-sm leading-6 text-[var(--muted)]">{t("Chưa có chuyến đi nào. Khi thêm một khoản chi, chọn “Chuyến mới…” để gom các khoản của một bữa tối, một chuyến đi hay một buổi hẹn.")}</p>}
      </Card>

      <Card title={t("Lịch sử chỉnh sửa")} className="xl:col-span-2">
        {history.isPending && <p role="status" className="text-sm text-[var(--muted)]">{t("Đang tải…")}</p>}
        {history.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(history.error, t("Chưa tải được lịch sử."))}</p>}
        {history.data && <ul className="divide-y divide-[var(--border)]">{history.data.map(change => <li key={change.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm">
          <span className="min-w-0 break-words">{describeChange(change, money)}{change.actorName && book.memberCount > 1 ? <span className="text-[var(--muted)]"> · {change.actorName}</span> : null}</span>
          <span className="shrink-0 text-xs text-[var(--muted)]">{new Date(change.at).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        </li>)}</ul>}
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("100 thay đổi gần nhất. Lịch sử chỉ được ghi thêm, không sửa hay xóa được.")}</p>
      </Card>
    </div>
  </>;
}
