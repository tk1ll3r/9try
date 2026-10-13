import { useState } from "react";
import { localDateKey, monthName } from "../../../kernel/dates";
import { Card } from "../../../kernel/ui/Card";
import { BarChart, StatTile, type Bar } from "../../../kernel/ui/Stat";
import { filterExpenses, totals, type Ledger } from "../domain/Ledger";
import { formatMoney } from "../domain/money";
import { BalanceCard } from "./BalanceCard";
import { BookScreen } from "./BookBar";
import { categoryIcon } from "./icons";
import { t } from "../../../kernel/i18n";

type Period = "month" | "quarter" | "year" | "all";
const periods: [Period, string][] = [["month", t("Tháng này")], ["quarter", t("3 tháng")], ["year", t("Năm nay")], ["all", t("Tất cả")]];
/** How many months the trend shows, the current one included. */
const trendMonths = 12;

/** The first day a period covers, "YYYY-MM-DD", or undefined for everything. */
function startOf(period: Period, now: Date): string | undefined {
  if (period === "all") return undefined;
  return localDateKey(period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1) : period === "quarter" ? new Date(now.getFullYear(), now.getMonth() - 2, 1) : new Date(now.getFullYear(), 0, 1));
}

export function ExpenseStatsPage() {
  return <BookScreen title={t("Thống kê chi tiêu")}>{ledger => <Numbers key={ledger.book.id} ledger={ledger} />}</BookScreen>;
}

function Numbers({ ledger }: { ledger: Ledger }) {
  const { book } = ledger;
  const [period, setPeriod] = useState<Period>("month");
  const now = new Date();
  const sums = totals(filterExpenses(ledger.expenses, { from: startOf(period, now) }));
  const money = (amount: number) => formatMoney(amount, book.currency);

  // The last twelve months, whatever period is chosen above: a trend needs its past.
  const perMonth = new Map(totals(ledger.expenses).byMonth);
  const bars: Bar[] = Array.from({ length: trendMonths }, (_, index) => {
    const first = new Date(now.getFullYear(), now.getMonth() - (trendMonths - 1 - index), 1);
    const amount = perMonth.get(localDateKey(first).slice(0, 7)) ?? 0;
    return { label: String(first.getMonth() + 1), title: `${monthName(first.getMonth() + 1)} ${first.getFullYear()}: ${money(amount)}`, parts: [{ value: amount, color: "var(--tone-event)" }] };
  });

  return <>
    <div role="group" aria-label={t("Khoảng thời gian")} className="flex gap-1 rounded-2xl bg-[var(--soft)] p-1 sm:w-fit">
      {periods.map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}
        className={`min-h-9 flex-1 whitespace-nowrap rounded-xl px-3 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${period === value ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>{label}</button>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card title={t("Đã chi")}>
        <p className="text-4xl font-black tabular-nums tracking-tight">{money(sums.total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {book.participants.map(person => <StatTile key={`paid-${person.id}`} value={money(sums.paidBy.get(person.id) ?? 0)} label={t("{0} đã trả", person.name)} />)}
          {book.participants.map(person => <StatTile key={`part-${person.id}`} value={money(sums.shareOf.get(person.id) ?? 0)} label={t("Phần của {0}", person.name)} />)}
        </div>
      </Card>

      <Card title={t("Theo hạng mục")}>
        {sums.byCategory.length ? <ul className="space-y-3">{sums.byCategory.map(([id, amount]) => {
          const category = book.categories.find(item => item.id === id);
          const Icon = categoryIcon(category?.icon);
          return <li key={id || "none"}>
            <p className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="shrink-0 text-[var(--muted)]" /><span className="min-w-0 flex-1 truncate">{category?.name ?? t("Chưa xếp hạng mục")}</span><span className="tabular-nums">{money(amount)}</span></p>
            <span aria-hidden className="mt-1.5 block h-2 overflow-hidden rounded-full bg-[var(--soft)]"><i className="block h-full rounded-full bg-[var(--tone-event)]" style={{ width: `${amount / sums.total * 100}%` }} /></span>
          </li>;
        })}</ul> : <p className="py-6 text-center text-sm text-[var(--muted)]">{t("Chưa có khoản chi nào trong khoảng này.")}</p>}
      </Card>

      {/* In a book of more than two the sentence "who owes whom" is a table; it belongs with the numbers. */}
      {book.participants.length > 2 && <div className="xl:col-span-2"><BalanceCard ledger={ledger} /></div>}

      <Card title={t("12 tháng gần đây")} className="xl:col-span-2">
        <BarChart bars={bars} label={t("Chi tiêu theo tháng")} />
      </Card>
    </div>
  </>;
}
