import { useRegistry } from "../../../kernel/session";
import { ProfileReminder } from "../../identity";
import { locale, t } from "../../../kernel/i18n";

/** What needs doing today. Each module adds its own card through `today`; a card with nothing to say stays away. */
export function TodayPage() {
  const { today } = useRegistry();
  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">{t("Hôm nay mình có gì?")}</h1></header>
    <ProfileReminder />
    {/* Two columns on a wide screen, filled top to bottom so that a short card leaves no hole beside a tall one. */}
    <div className="space-y-5 xl:columns-2 xl:gap-5 xl:space-y-0 xl:*:mb-5 xl:*:break-inside-avoid">
      {today.map(({ card: TodayCard }, index) => <TodayCard key={index} />)}
    </div>
  </div>;
}
