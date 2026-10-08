import { MessageCircle, Star } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { RankedFriend } from "../domain/FriendRanking";
import { MemberAvatar } from "./MemberAvatar";
import { choiceOf, reasonIcon, timeLeft } from "./modes";
import { t } from "../../../kernel/i18n";

export interface Pins {
  available: boolean;
  pending: boolean;
  toggle(userId: string): void;
}

const modeLine = (item: RankedFriend, now: number) => {
  const choice = choiceOf(item.mode?.mode);
  return choice && item.mode ? `${choice.label} · ${timeLeft(item.mode.expiresAt, now)}` : t("Chưa bật mode");
};

function PinButton({ item, pins }: { item: RankedFriend; pins: Pins }) {
  if (!pins.available) return null;
  const name = item.friend.displayName;
  return <button type="button" aria-pressed={item.pinned} aria-label={item.pinned ? t("Bỏ ghim {0}", name) : t("Ghim {0}", name)} disabled={pins.pending} onClick={() => pins.toggle(item.friend.userId)}
    className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--muted)] transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-110 active:scale-90 disabled:opacity-50">
    <Star size={19} className={item.pinned ? "fill-amber-400 text-amber-400" : ""} />
  </button>;
}

/** A friend worth noticing right now: who, what they are doing, and why they are up here. */
export function FeaturedFriend({ item, now, pins }: { item: RankedFriend; now: number; pins: Pins }) {
  const choice = choiceOf(item.mode?.mode);
  const name = item.friend.displayName;
  return <li data-flip={item.friend.userId} style={choice ? { "--mode": choice.color } as CSSProperties : undefined}
    className={`rounded-3xl border border-black/8 bg-[color-mix(in_srgb,var(--surface)_90%,transparent)] p-3 backdrop-blur-md dark:border-white/8 ${choice ? "mode-glow" : ""}`}>
    <div className="flex items-center gap-1">
      <Link to={`/chat/with/${item.friend.userId}`} aria-label={t("Nhắn tin cho {0}", name)} className="pressable flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1">
        <MemberAvatar name={name} choice={choice} />
        <span className="min-w-0">
          <b className="block truncate text-lg">{name}</b>
          <span className="block truncate text-sm text-[var(--muted)]">{modeLine(item, now)}</span>
        </span>
        <MessageCircle size={18} className="ml-auto shrink-0 text-[var(--muted)]" />
      </Link>
      <PinButton item={item} pins={pins} />
    </div>
    {item.reasons.length > 0 && <ul aria-label={t("Vì sao {0} ở trên", name)} className="mt-2 flex flex-wrap gap-2">
      {item.reasons.slice(0, 2).map(reason => {
        const Icon = reasonIcon(reason.kind);
        const chip = <><Icon size={14} className="shrink-0" /> <span className="truncate">{reason.label}</span></>;
        const look = "inline-flex max-w-full min-h-8 items-center gap-1.5 rounded-full bg-[var(--soft)] px-3 text-xs font-semibold";
        return <li key={reason.kind} className="min-w-0">{reason.to ? <Link to={reason.to} className={`${look} hover:underline`}>{chip}</Link> : <span className={look}>{chip}</span>}</li>;
      })}
    </ul>}
  </li>;
}

/** Everyone else, one compact row each. */
export function FriendRow({ item, now, pins }: { item: RankedFriend; now: number; pins: Pins }) {
  const name = item.friend.displayName;
  return <li data-flip={item.friend.userId} className="flex items-center gap-1 rounded-2xl bg-[var(--soft)] p-1.5">
    <Link to={`/chat/with/${item.friend.userId}`} aria-label={t("Nhắn tin cho {0}", name)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1">
      <MemberAvatar name={name} choice={choiceOf(item.mode?.mode)} size="sm" />
      <span className="min-w-0">
        <b className="block truncate">{name}</b>
        <span className="block truncate text-xs text-[var(--muted)]">{modeLine(item, now)}</span>
      </span>
    </Link>
    <PinButton item={item} pins={pins} />
  </li>;
}
