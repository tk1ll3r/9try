import { ChevronDown } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "../../../kernel/ui/Button";
import { divisionOf, splitEvenly, splitOnPayer, splitProblem, type Book, type Expense, type ExpenseDraft, type Split, type SplitMode } from "../domain/Ledger";
import { formatMoney, parseAmount } from "../domain/money";
import { categoryIcon } from "./icons";
import { t } from "../../../kernel/i18n";

const chip = (on: boolean) => `inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3.5 text-sm font-semibold transition-colors duration-200 ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)] text-[var(--muted)]"}`;
const modes: [SplitMode, string][] = [["equal", t("Chia đều")], ["payer", t("Người trả chịu hết")], ["custom", t("Tự chia")]];
/** The outing field's value for "a new one, named below". */
const newOuting = "new";

/**
 * One expense, to add or to change. The short way is an amount, who paid, and the button: the day
 * is today and the amount is divided the book's usual way. The day, the category, the outing, a
 * note and another division are under "Thêm chi tiết". `onSave` gets the expense, and the name of
 * an outing to make first when the person typed a new one. The form keeps what was typed, also
 * after a failed save; give it a new `key` once a save went through, to start empty again.
 */
export function ExpenseForm({ book, initial, today, pending, error, onSave }: {
  book: Book; initial?: Expense; today: string; pending: boolean; error: string; onSave(draft: ExpenseDraft, outingTitle?: string): void;
}) {
  const people = book.participants;
  const ids = people.map(person => person.id);
  const me = people.find(person => person.isMe) ?? people[0];
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : "");
  const [payerId, setPayerId] = useState(initial?.payerId ?? me.id);
  const [spentOn, setSpentOn] = useState(initial?.spentOn ?? today);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [outingId, setOutingId] = useState(initial?.outingId ?? "");
  const [outingTitle, setOutingTitle] = useState("");
  const [note, setNote] = useState(initial?.note ?? "");
  const [mode, setMode] = useState<SplitMode>(initial ? divisionOf(initial, ids).mode : book.defaultSplit);
  // In a book of more than two, an even division can be among some of them: a dinner three of five went to.
  const [sharers, setSharers] = useState<string[]>(() => initial ? divisionOf(initial, ids).sharers : ids);
  // In a custom division every part but the last is typed; the last is what is left.
  const [typedParts, setTypedParts] = useState<string[]>(() => ids.slice(0, -1).map(id => String(initial?.splits.find(part => part.participantId === id)?.amount ?? "")));
  const [more, setMore] = useState(!!initial);
  const [problem, setProblem] = useState("");

  const amount = parseAmount(amountText);
  const typed = typedParts.map(text => /^0*$/.test(text.trim()) ? 0 : parseAmount(text));
  const rest = amount !== null && typed.every(part => part !== null) ? amount - (typed as number[]).reduce((sum, part) => sum + part, 0) : null;
  const splits: Split[] | null = amount === null ? null
    : mode === "equal" ? (sharers.length ? ids.map(participantId => splitEvenly(amount, sharers, payerId).find(part => part.participantId === participantId) ?? { participantId, amount: 0 }) : null)
    : mode === "payer" ? splitOnPayer(amount, ids, payerId)
    : rest === null ? null : ids.map((participantId, index) => ({ participantId, amount: index < typed.length ? typed[index]! : rest }));

  function save(event: FormEvent) {
    event.preventDefault();
    const wrong = amount === null ? t("Hãy nhập số tiền, ví dụ 600000, 600.000 hoặc 600k.")
      : !splits ? (mode === "equal" ? t("Hãy chọn ít nhất một người để chia.") : t("Hãy nhập phần của từng người bằng số tiền."))
      : splitProblem(amount, splits) || (outingId === newOuting && !outingTitle.trim() ? t("Hãy đặt tên cho chuyến đi mới.") : "");
    setProblem(wrong);
    if (wrong || amount === null || !splits) return;
    onSave({ id: initial?.id, version: initial?.version, amount, payerId, spentOn, categoryId: categoryId || null, outingId: outingId && outingId !== newOuting ? outingId : null, note, splits },
      outingId === newOuting ? outingTitle : undefined);
  }

  return <form onSubmit={save} className="grid grid-cols-1 gap-4" aria-busy={pending}>
    <label className="grid gap-1 text-sm font-semibold">{t("Số tiền")}
      <input className="field w-full min-w-0 text-2xl font-black tabular-nums" inputMode="decimal" autoComplete="off" required value={amountText} onChange={event => setAmountText(event.target.value)} placeholder="600k" aria-describedby="amount-read" />
      <span id="amount-read" className="min-h-5 text-xs font-normal text-[var(--muted)]">{amount !== null ? formatMoney(amount, book.currency) : amountText.trim() ? t("Chưa đọc được số tiền này.") : t("Gõ 600000, 600.000, 600k hoặc 1tr2.")}</span>
    </label>

    <div role="group" aria-label={t("Ai trả?")} className={people.length > 3 ? "flex flex-wrap gap-2" : "grid gap-2"} style={people.length > 3 ? undefined : { gridTemplateColumns: `repeat(${people.length}, minmax(0, 1fr))` }}>
      {people.map(person => <button key={person.id} type="button" aria-pressed={payerId === person.id} onClick={() => setPayerId(person.id)} className={chip(payerId === person.id)}>
        <span className="truncate">{t("{0} trả", person.name)}</span>
      </button>)}
    </div>

    <div className="rounded-2xl bg-[var(--soft)]">
      <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-sm font-semibold">
        {t("Thêm chi tiết")} <ChevronDown size={17} className={`transition-transform duration-200 ${more ? "rotate-180" : ""}`} />
      </button>
      {more && <div className="grid gap-3 px-3 pb-3">
        <label className="grid gap-1 text-sm font-semibold">{t("Ngày")}
          <input className="field" type="date" required max={today} value={spentOn} onChange={event => setSpentOn(event.target.value)} />
        </label>
        <div role="group" aria-label={t("Hạng mục")} className="flex flex-wrap gap-2">
          {book.categories.map(category => { const Icon = categoryIcon(category.icon); const on = categoryId === category.id;
            return <button key={category.id} type="button" aria-pressed={on} onClick={() => setCategoryId(on ? "" : category.id)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}><Icon size={15} /> {category.name}</button>; })}
        </div>
        <label className="grid gap-1 text-sm font-semibold">{t("Chuyến đi (tùy chọn)")}
          <select className="field" value={outingId} onChange={event => setOutingId(event.target.value)}>
            <option value="">{t("Không thuộc chuyến nào")}</option>
            {book.outings.map(outing => <option key={outing.id} value={outing.id}>{outing.title}</option>)}
            <option value={newOuting}>{t("Chuyến mới…")}</option>
          </select>
        </label>
        {outingId === newOuting && <label className="grid gap-1 text-sm font-semibold">{t("Tên chuyến đi")}
          <input className="field" maxLength={80} value={outingTitle} onChange={event => setOutingTitle(event.target.value)} placeholder={t("Ví dụ: Ăn tối thứ sáu, Đà Lạt, Hẹn hò")} />
        </label>}
        <label className="grid gap-1 text-sm font-semibold">{t("Ghi chú (tùy chọn)")}
          <input className="field" maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
        </label>
        <div role="group" aria-label={t("Chia thế nào?")} className="grid grid-cols-3 gap-1 rounded-2xl bg-[var(--surface)] p-1">
          {modes.map(([value, label]) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
            className={`min-h-10 rounded-xl px-1.5 text-xs font-semibold leading-tight ${mode === value ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"}`}>{label}</button>)}
        </div>
        {mode === "equal" && people.length > 2 && <div role="group" aria-label={t("Chia cho ai?")} className="flex flex-wrap gap-2">
          {people.map(person => { const on = sharers.includes(person.id);
            return <button key={person.id} type="button" aria-pressed={on} onClick={() => setSharers(on ? sharers.filter(id => id !== person.id) : ids.filter(id => id === person.id || sharers.includes(id)))}
              className={`inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--surface)] text-[var(--muted)]"}`}>{person.name}</button>; })}
        </div>}
        {mode === "custom" && <div className="grid gap-2 sm:grid-cols-2">
          {people.slice(0, -1).map((person, index) => <label key={person.id} className="grid gap-1 text-sm font-semibold">{t("Phần của {0}", person.name)}
            <input className="field tabular-nums" inputMode="decimal" value={typedParts[index]} onChange={event => setTypedParts(typedParts.map((text, at) => at === index ? event.target.value : text))} placeholder="0" />
          </label>)}
          <p className="self-end rounded-2xl bg-[var(--surface)] p-3 text-sm">{t("Phần của {0}", people[people.length - 1].name)}: <b className="tabular-nums">{rest !== null && rest >= 0 ? formatMoney(rest, book.currency) : "—"}</b></p>
        </div>}
        {splits && mode !== "custom" && amount !== null && <p className="text-xs text-[var(--muted)]">{people.map(person => `${person.name} ${formatMoney(splits.find(part => part.participantId === person.id)?.amount ?? 0, book.currency)}`).join(" · ")}</p>}
      </div>}
    </div>

    {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{problem || error}</p>}
    <Button type="submit" className="w-full" disabled={pending}>{pending ? t("Đang lưu…") : initial ? t("Lưu thay đổi") : t("Lưu khoản chi")}</Button>
  </form>;
}
