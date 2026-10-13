import { Eye, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { dayTitle, localDateKey } from "../../../kernel/dates";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { MoreMenu } from "../../../kernel/ui/MoreMenu";
import { canChange, canWrite, divisionOf, filterExpenses, totals, type Expense, type ExpenseDraft, type ExpenseFilter, type Ledger } from "../domain/Ledger";
import { formatMoney } from "../domain/money";
import { expensesModule } from "../expenses.module";
import { BalanceCard } from "./BalanceCard";
import { BookScreen } from "./BookBar";
import { ExpenseForm } from "./ExpenseForm";
import { categoryIcon } from "./icons";
import { expensesKey } from "./useLedger";
import { t } from "../../../kernel/i18n";

/** The book: a new expense in three taps, who owes whom, and every entry, to filter, change or remove. */
export function ExpensesPage() {
  return <BookScreen title={t("Chi tiêu")}>{ledger => <Entries key={ledger.book.id} ledger={ledger} />}</BookScreen>;
}

function Entries({ ledger }: { ledger: Ledger }) {
  const repository = useModule(expensesModule);
  const me = useUserId();
  const confirm = useConfirm();
  const { run, pending, error } = useAction(expensesKey);
  const { book } = ledger;
  // An editor adds entries and changes their own; a viewer reads. The server holds the same rules.
  const writer = canWrite(book.role);
  const mayChange = (expense: Expense) => canChange(expense, me, book.role);
  const today = localDateKey(new Date());
  const name = (id: string) => book.participants.find(person => person.id === id)?.name ?? "";
  const money = (amount: number) => formatMoney(amount, book.currency);
  const [filter, setFilter] = useState<ExpenseFilter>({});
  const [editing, setEditing] = useState<Expense | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [notice, setNotice] = useState("");
  // Counts the expenses added here. The form for a new one starts empty again only after a save went through.
  const [added, setAdded] = useState(0);

  /** Saves an expense. A new outing typed in the form is made first, and the expense put in it. */
  function save(draft: ExpenseDraft, outingTitle?: string, done = t("Đã lưu khoản chi.")) {
    setNotice("");
    run(async () => {
      const outingId = outingTitle ? await repository.addOuting(book.id, outingTitle, draft.spentOn) : draft.outingId;
      await repository.saveExpense(book.id, { ...draft, outingId });
    }, () => { setEditOpen(false); setNotice(done); if (!draft.id) setAdded(count => count + 1); });
  }
  async function remove(expense: Expense) {
    if (!await confirm({ title: t("Xóa khoản chi?"), body: t("Khoản {0} ngày {1} sẽ bị xóa khỏi sổ. Lịch sử của sổ vẫn ghi lại nó.", money(expense.amount), dayTitle(expense.spentOn)), action: t("Xóa khoản chi") })) return;
    setNotice("");
    run(() => repository.deleteExpense(expense.id), () => setNotice(t("Đã xóa khoản chi.")));
  }

  const shown = useMemo(() => filterExpenses(ledger.expenses, filter), [ledger.expenses, filter]);
  const filtered = Object.values(filter).some(Boolean);
  const byDay = new Map<string, Expense[]>();
  for (const expense of shown) byDay.set(expense.spentOn, [...(byDay.get(expense.spentOn) ?? []), expense]);
  const ids = book.participants.map(person => person.id);
  const pick = (key: keyof ExpenseFilter) => (event: { target: { value: string } }) => setFilter({ ...filter, [key]: event.target.value || undefined });

  return <>
    {notice && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{notice}</div>}
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-5">
        {writer ? <Card title={t("Thêm khoản chi")}>
          <ExpenseForm key={added} book={book} today={today} pending={pending} error={editOpen ? "" : error} onSave={save} />
        </Card> : <p className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6"><Eye size={17} className="shrink-0 text-[var(--muted)]" /> {t("Bạn xem được sổ này. Việc nhập khoản chi là của chủ sổ và những người được nhập.")}</p>}
        <BalanceCard ledger={ledger} />
      </div>

      <Card title={filtered ? t("Đang lọc · {0} khoản · {1}", shown.length, money(totals(shown).total)) : t("Mọi khoản chi · {0}", ledger.expenses.length)}
        action={filtered ? <Button variant="ghost" className="min-h-9 px-3 py-1.5" onClick={() => setFilter({})}>{t("Bỏ lọc")}</Button> : undefined}>
        <div role="group" aria-label={t("Lọc khoản chi")} className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">{t("Từ ngày")}<input className="field min-w-0 text-sm" type="date" value={filter.from ?? ""} onChange={pick("from")} /></label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">{t("Đến ngày")}<input className="field min-w-0 text-sm" type="date" value={filter.to ?? ""} onChange={pick("to")} /></label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">{t("Hạng mục")}<select className="field min-w-0 text-sm" value={filter.categoryId ?? ""} onChange={pick("categoryId")}>
            <option value="">{t("Tất cả")}</option>{book.categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="grid gap-1 text-xs font-semibold text-[var(--muted)]">{t("Người trả")}<select className="field min-w-0 text-sm" value={filter.payerId ?? ""} onChange={pick("payerId")}>
            <option value="">{t("Tất cả")}</option>{book.participants.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="col-span-2 grid gap-1 text-xs font-semibold text-[var(--muted)] lg:col-span-1">{t("Chuyến đi")}<select className="field min-w-0 text-sm" value={filter.outingId ?? ""} onChange={pick("outingId")}>
            <option value="">{t("Tất cả")}</option>{book.outings.map(outing => <option key={outing.id} value={outing.id}>{outing.title}</option>)}</select></label>
        </div>

        {shown.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">{filtered ? t("Không có khoản chi nào khớp với bộ lọc.") : t("Sổ còn trống. Nhập số tiền, chọn ai trả, rồi bấm Lưu.")}</p>}
        <div className="mt-4 space-y-4">
          {[...byDay].map(([day, expenses]) => <section key={day} aria-label={dayTitle(day)}>
            <h3 className="mb-1.5 flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wider text-[var(--muted)]"><span>{day === today ? t("Hôm nay") : dayTitle(day)}</span><span className="tabular-nums">{money(expenses.reduce((sum, expense) => sum + expense.amount, 0))}</span></h3>
            <ul className="space-y-1.5">{expenses.map(expense => {
              const category = book.categories.find(item => item.id === expense.categoryId);
              const outing = book.outings.find(item => item.id === expense.outingId);
              const Icon = categoryIcon(category?.icon);
              const { mode, sharers } = divisionOf(expense, ids);
              const title = expense.note || category?.name || t("Khoản chi");
              const line = <>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface)]"><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{title}</b>
                  <span className="block truncate text-xs text-[var(--muted)]">{[t("{0} trả", name(expense.payerId)), mode === "payer" ? t("của riêng {0}", name(expense.payerId)) : mode === "custom" ? t("tự chia") : sharers.length < ids.length ? t("chia cho {0}", sharers.map(name).join(", ")) : "", outing?.title, expense.note && category?.name].filter(Boolean).join(" · ")}</span>
                </span>
                <b className="shrink-0 tabular-nums">{money(expense.amount)}</b>
              </>;
              // An entry the reader may not change is read, not pressed.
              return <li key={expense.id} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] p-2">
                {mayChange(expense) ? <>
                  <button type="button" aria-label={t("Sửa khoản chi: {0}, {1}", title, money(expense.amount))} onClick={() => { setEditing(expense); setEditOpen(true); }} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left">{line}</button>
                  <MoreMenu label={t("Thao tác với khoản chi: {0}", title)}>
                    <button type="button" onClick={() => { setEditing(expense); setEditOpen(true); }}><Pencil size={16} /> {t("Sửa")}</button>
                    <button type="button" className="text-[var(--danger)]" disabled={pending} onClick={() => void remove(expense)}><Trash2 size={16} /> {t("Xóa")}</button>
                  </MoreMenu>
                </> : <div className="flex min-w-0 flex-1 items-center gap-3 p-1 pr-3">{line}</div>}
              </li>;
            })}</ul>
          </section>)}
        </div>
      </Card>
    </div>

    {editing && <DialogPanel size="sm" open={editOpen} onOpenChange={setEditOpen} busy={pending} title={t("Sửa khoản chi")} description={t("Thay đổi được ghi vào lịch sử của sổ.")}>
      <ExpenseForm key={`${editing.id}:${editing.version}`} book={book} initial={editing} today={today} pending={pending} error={editOpen ? error : ""} onSave={(draft, outingTitle) => save(draft, outingTitle, t("Đã lưu thay đổi."))} />
    </DialogPanel>}
  </>;
}
