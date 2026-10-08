import { CalendarSearch } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { PeoplePicker, useAcceptedFriends } from "../../friends";
import { ProposeMeetupDialog } from "../../meetups";
import { calendarModule } from "../calendar.module";
import { findFreeSlots, toInterval, type Interval } from "../domain/freeSlots";
import { locale, t } from "../../../kernel/i18n";

const day = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "numeric" });
const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });

/** Finds times when the user and the chosen friends are all free, from the busy times they share. */
export function FreeTimePage() {
  const calendar = useModule(calendarModule);
  const friends = useAcceptedFriends();
  const [people, setPeople] = useState<string[]>([]);
  const [days, setDays] = useState(7);
  const [minutes, setMinutes] = useState(60);
  const [fromHour, setFromHour] = useState(8);
  const [toHour, setToHour] = useState(22);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ slots: Interval[]; unknown: string[]; people: string[]; minutes: number } | null>(null);
  // The free time the user picked to turn into a proposal: as long as was asked for, from the start of the gap.
  const [picked, setPicked] = useState<Interval | null>(null);
  const [proposing, setProposing] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (searching) return;
    setSearching(true); setError(""); setResult(null);
    try {
      const from = new Date();
      const to = new Date(from.getTime() + days * 86_400_000);
      const mine = await calendar.listOccurrences(from, to);
      // A friend who does not share busy times is unknown, never assumed to be free.
      const theirs = await Promise.all(people.map(id => calendar.busyFor(id, from, to).catch(() => null)));
      const unknown = people.filter((_, index) => theirs[index] === null).map(id => friends.find(friend => friend.userId === id)?.displayName ?? t("Một người bạn"));
      const busy = [...mine, ...theirs.flatMap(list => list ?? [])].map(toInterval);
      setResult({ slots: findFreeSlots(busy, from, days, fromHour, toHour, minutes), unknown, people, minutes });
    } catch (cause) {
      setError(errorMessage(cause, t("Không tìm được giờ rảnh. Hãy thử lại.")));
    } finally { setSearching(false); }
  }

  const byDay = new Map<string, Interval[]>();
  for (const slot of result?.slots ?? []) {
    const key = day.format(slot.start);
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">{t("Từ lịch của bạn và giờ bận mà bạn bè chia sẻ")}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Rảnh lúc nào?")}</h1>
      </header>

      <Card title={t("Tìm giờ cùng rảnh")} action={<CalendarSearch size={18} className="text-[var(--muted)]" />}>
        <form onSubmit={search} className="space-y-3">
          <PeoplePicker legend={t("Với ai")} value={people} onChange={setPeople} />
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-sm font-semibold">{t("Trong")}<select className="field" value={days} onChange={event => setDays(Number(event.target.value))}>
              <option value={3}>{t("3 ngày tới")}</option><option value={7}>{t("7 ngày tới")}</option><option value={14}>{t("14 ngày tới")}</option>
            </select></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Cần ít nhất")}<select className="field" value={minutes} onChange={event => setMinutes(Number(event.target.value))}>
              <option value={30}>{t("30 phút")}</option><option value={60}>{t("1 giờ")}</option><option value={120}>{t("2 giờ")}</option><option value={180}>{t("3 giờ")}</option>
            </select></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Từ")}<select className="field" value={fromHour} onChange={event => setFromHour(Number(event.target.value))}>
              {[6, 7, 8, 9, 10, 12, 14].map(hour => <option key={hour} value={hour}>{hour}:00</option>)}
            </select></label>
            <label className="grid gap-1 text-sm font-semibold">{t("Đến")}<select className="field" value={toHour} onChange={event => setToHour(Number(event.target.value))}>
              {[12, 17, 18, 20, 21, 22, 23].map(hour => <option key={hour} value={hour}>{hour}:00</option>)}
            </select></label>
          </div>
          <Button type="submit" disabled={searching || fromHour >= toHour}>{searching ? t("Đang tìm…") : t("Tìm giờ rảnh")}</Button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      </Card>

      {result && (
        <Card title={t("Giờ cùng rảnh · {0}", result.slots.length)}>
          {result.unknown.length > 0 && <p className="mb-3 rounded-2xl bg-amber-100 p-3 text-sm text-amber-950">{t("Chưa rõ lịch của {0} vì họ chưa chia sẻ bận/rảnh với bạn. Kết quả dưới đây không tính đến họ.", result.unknown.join(", "))}</p>}
          {result.slots.length === 0 ? <p className="py-4 text-sm text-[var(--muted)]">{t("Không có khoảng nào đủ dài. Thử giảm thời lượng hoặc mở rộng khung giờ.")}</p> : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--muted)]">{t("Chạm một khung giờ để rủ mọi người vào giờ đó.")}</p>
              {[...byDay].map(([label, slots]) => <section key={label}>
                <h2 className="mb-2 text-sm font-bold capitalize text-[var(--muted)]">{label}</h2>
                <ul className="flex flex-wrap gap-2">{slots.map(slot => <li key={slot.start}>
                  <button type="button" aria-label={t("Rủ mọi người, {0}, {1}–{2}", label, time.format(slot.start), time.format(slot.end))}
                    onClick={() => { setPicked({ start: slot.start, end: Math.min(slot.end, slot.start + result.minutes * 60_000) }); setProposing(true); }}
                    className="pressable min-h-11 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm font-semibold tabular-nums hover:bg-[var(--lime)] hover:text-[#1d230e]">{time.format(slot.start)}–{time.format(slot.end)}</button>
                </li>)}</ul>
              </section>)}
            </div>
          )}
        </Card>
      )}
      {result && picked && <ProposeMeetupDialog key={picked.start} open={proposing} onOpenChange={setProposing} start={picked.start} end={picked.end} inviteeIds={result.people} />}
    </div>
  );
}
