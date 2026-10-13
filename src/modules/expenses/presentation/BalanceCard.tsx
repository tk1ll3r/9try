import { HandCoins, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { dayTitle, localDateKey } from "../../../kernel/dates";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { balances, canChange, canWrite, debt, settleUp, type Ledger } from "../domain/Ledger";
import { formatMoney, parseAmount } from "../domain/money";
import { expensesModule } from "../expenses.module";
import { expensesKey } from "./useLedger";
import { t } from "../../../kernel/i18n";

/**
 * Who owes whom, what was paid back, and the way to record a repayment. Two people get one
 * sentence. More get what each one is owed or owes, and the fewest repayments that leave everyone even.
 */
export function BalanceCard({ ledger }: { ledger: Ledger }) {
  const repository = useModule(expensesModule);
  const me = useUserId();
  const { run, pending, error } = useAction(expensesKey);
  const { book } = ledger;
  const pair = book.participants.length === 2;
  const owes = debt(ledger);
  const owed = balances(ledger);
  const payments = settleUp(owed);
  const writer = canWrite(book.role);
  const name = (id: string) => book.participants.find(person => person.id === id)?.name ?? "";
  const isMe = (id: string) => book.participants.find(person => person.id === id)?.isMe ?? false;
  const money = (amount: number) => formatMoney(amount, book.currency);
  const [paying, setPaying] = useState<{ fromId: string; toId: string } | null>(null);
  const [amountText, setAmountText] = useState("");
  const [problem, setProblem] = useState("");
  const begin = (payment: { fromId: string; toId: string; amount: number }) => { setAmountText(String(payment.amount)); setProblem(""); setPaying(payment); };

  function record(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmount(amountText);
    setProblem(amount === null ? t("Hãy nhập số tiền, ví dụ 600000, 600.000 hoặc 600k.") : "");
    if (amount === null || !paying) return;
    run(() => repository.saveSettlement(book.id, { fromId: paying.fromId, toId: paying.toId, amount, settledOn: localDateKey(new Date()), note: "" }), () => setPaying(null));
  }

  return <Card title={t("Ai nợ ai")} action={<HandCoins size={18} className="text-[var(--muted)]" />}>
    {pair ? <p role="status" className="text-xl font-black tracking-tight">{!owes ? t("Hai bạn không ai nợ ai.")
      : isMe(owes.toId) ? t("{0} nợ bạn {1}", name(owes.fromId), money(owes.amount))
      : isMe(owes.fromId) ? t("Bạn nợ {0} {1}", name(owes.toId), money(owes.amount))
      : t("{0} nợ {1} {2}", name(owes.fromId), name(owes.toId), money(owes.amount))}</p>
      : <>
        <p role="status" className="text-xl font-black tracking-tight">{payments.length ? t("Còn {0} khoản cần trả lại để mọi người hết nợ nhau.", payments.length) : t("Không ai nợ ai.")}</p>
        <ul aria-label={t("Mỗi người đang được nhận hay đang nợ")} className="mt-3 grid gap-1.5 sm:grid-cols-2">{book.participants.map(person => { const amount = owed.get(person.id) ?? 0;
          return <li key={person.id} className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
            <b className="min-w-0 truncate">{person.name}</b>
            <span className={`shrink-0 tabular-nums ${amount > 0 ? "text-[var(--success)]" : amount < 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{amount > 0 ? t("được nhận {0}", money(amount)) : amount < 0 ? t("nợ {0}", money(-amount)) : t("đã cân bằng")}</span>
          </li>; })}</ul>
        {payments.length > 0 && <ul aria-label={t("Cách trả lại gọn nhất")} className="mt-3 space-y-1.5">{payments.map(payment => <li key={`${payment.fromId}-${payment.toId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] px-3 py-2 text-sm">
          <span className="min-w-0">{t("{0} trả {1} {2}", name(payment.fromId), name(payment.toId), money(payment.amount))}</span>
          {writer && <Button variant="ghost" className="min-h-9 px-3 py-1.5" disabled={pending} onClick={() => begin(payment)}>{t("Ghi là đã trả")}</Button>}
        </li>)}</ul>}
      </>}
    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("Tính từ mọi khoản chi và mọi lần trả lại. Trả lại không được tính là chi tiêu.")}</p>
    {pair && owes && writer && !paying && <Button className="mt-3" variant="secondary" onClick={() => begin(owes)}>{t("Ghi nhận đã trả lại")}</Button>}
    {paying && <form onSubmit={record} className="mt-3 grid gap-2" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-semibold">{t("{0} trả lại {1} bao nhiêu?", name(paying.fromId), name(paying.toId))}
        <input className="field tabular-nums" inputMode="decimal" required value={amountText} onChange={event => setAmountText(event.target.value)} />
      </label>
      {(problem || error) && <p role="alert" className="text-sm text-[var(--danger)]">{problem || error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? t("Đang lưu…") : t("Lưu")}</Button><Button variant="ghost" onClick={() => setPaying(null)}>{t("Thôi")}</Button></div>
    </form>}
    {ledger.settlements.length > 0 && <ul aria-label={t("Những lần trả lại")} className="mt-4 space-y-1.5 border-t border-[var(--border)] pt-4">
      {ledger.settlements.slice(0, 5).map(paid => <li key={paid.id} className="flex items-center gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{t("{0} trả lại {1} · {2}", name(paid.fromId), name(paid.toId), dayTitle(paid.settledOn))}</span>
        <b className="shrink-0 tabular-nums">{money(paid.amount)}</b>
        {canChange(paid, me, book.role) && <button type="button" aria-label={t("Xóa lần trả lại {0}", money(paid.amount))} disabled={pending} onClick={() => run(() => repository.deleteSettlement(paid.id))} className="grid size-9 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--soft)]"><Trash2 size={15} /></button>}
      </li>)}
    </ul>}
  </Card>;
}
