import { useState } from "react";
import { useRegistry } from "../../../kernel/session";
import { t } from "../../../kernel/i18n";

const periods = [7, 30];

/** What the user did lately, in numbers. Each module counts its own part; this screen lines the cards up and picks the period. */
export function StatsPage() {
  const { stats } = useRegistry();
  const [days, setDays] = useState(periods[0]);
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[var(--muted)]">{t("Đếm từ dữ liệu của riêng bạn, chỉ mình bạn thấy")}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Thống kê")}</h1>
      </div>
      <div role="group" aria-label={t("Khoảng thời gian")} className="flex gap-1 rounded-2xl bg-[var(--soft)] p-1">
        {periods.map(count => <button key={count} type="button" aria-pressed={days === count} onClick={() => setDays(count)}
          className={`min-h-9 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-200 ${days === count ? "bg-[var(--surface)] text-[var(--ink)] shadow" : "text-[var(--muted)]"}`}>{t("{0} ngày qua", count)}</button>)}
      </div>
    </header>
    {/* Two columns on a wide screen, filled top to bottom so that a short card leaves no hole beside a tall one. */}
    <div className="space-y-5 xl:columns-2 xl:gap-5 xl:space-y-0 xl:*:mb-5 xl:*:break-inside-avoid">
      {stats.map(({ card: StatsCard }, index) => <StatsCard key={index} days={days} />)}
    </div>
  </div>;
}
