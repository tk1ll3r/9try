import { useAcceptedFriends } from "./useFriends";
import { t } from "../../../kernel/i18n";

/** Tick friends from a list. `value` holds their user ids. The friends in `first` are listed before the others. */
export function PeoplePicker({ legend, value, onChange, first = [] }: { legend: string; value: string[]; onChange(ids: string[]): void; first?: readonly string[] }) {
  const all = useAcceptedFriends();
  const rank = (id: string) => first.includes(id) ? first.indexOf(id) : first.length;
  const friends = first.length ? [...all].sort((a, b) => rank(a.userId) - rank(b.userId)) : all;
  return (
    <fieldset className="rounded-2xl bg-[var(--soft)] p-3">
      <legend className="px-1 text-xs font-bold text-[var(--muted)]">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {friends.length === 0 && <span className="text-sm text-[var(--muted)]">{t("Chưa có bạn bè để chọn.")}</span>}
        {friends.map(friend => {
          const checked = value.includes(friend.userId);
          return (
            <label key={friend.userId} className="flex min-h-11 items-center gap-2 rounded-xl bg-[var(--surface)] px-3 py-2 text-sm font-semibold">
              <input type="checkbox" checked={checked}
                onChange={() => onChange(checked ? value.filter(id => id !== friend.userId) : [...value, friend.userId])} />
              {friend.displayName}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
