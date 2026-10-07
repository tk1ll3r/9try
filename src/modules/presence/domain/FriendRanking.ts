import type { ActiveMode } from "./ActivityMode";

/** The part of a friend the ranking needs. */
export interface Person {
  userId: string;
  displayName: string;
}

/** A reason to place a friend higher. Modules report these (the kernel's `FriendSignal` has this shape). */
export interface Reason {
  userId: string;
  kind: string;
  /** From 0 to 1. */
  strength: number;
  label?: string;
  to?: string;
}

export interface RankedFriend<Friend extends Person = Person> {
  friend: Friend;
  /** The mode that is running now, if any. */
  mode?: ActiveMode;
  pinned: boolean;
  score: number;
  /** What to show on the card: the reasons that have a label, the one that counts most first. */
  reasons: Reason[];
}

/** What each kind of reason is worth at full strength. A kind that is not listed is worth `otherWeight`. */
export const defaultWeights: Readonly<Record<string, number>> = { meetup: 100, invite: 70, unread: 60, location: 50, chat: 45, mode: 40 };
const otherWeight = 20;
/** A mode counts in full for this long after it was set, then for less. */
const freshMs = 15 * 60_000;

/**
 * Sorts friends by how much they matter to the user right now.
 * Score = the sum, over the kinds of reason, of weight × the strongest reason of that kind.
 * Order: pinned friends, then score, then friends with a mode on, then name.
 */
export class FriendRanking {
  constructor(private readonly weights: Readonly<Record<string, number>> = defaultWeights) {}

  rank<Friend extends Person>(friends: readonly Friend[], modes: readonly ActiveMode[], signals: readonly Reason[], pinned: ReadonlySet<string>, now: Date): RankedFriend<Friend>[] {
    const at = now.getTime();
    return friends.map(friend => {
      const mode = modes.find(item => item.userId === friend.userId && Date.parse(item.expiresAt) > at);
      const own = signals.filter(signal => signal.userId === friend.userId);
      if (mode) {
        const fresh = at - Date.parse(mode.startedAt) < freshMs;
        own.push({ userId: friend.userId, kind: "mode", strength: fresh ? 1 : 0.6, label: fresh ? "Vừa bật" : undefined });
      }
      // Several reasons of one kind count once, at their strongest.
      const strongest = new Map<string, Reason>();
      for (const reason of own) if ((strongest.get(reason.kind)?.strength ?? -1) < reason.strength) strongest.set(reason.kind, reason);
      const weighed = [...strongest.values()]
        .map(reason => ({ reason, points: (this.weights[reason.kind] ?? otherWeight) * Math.min(1, Math.max(0, reason.strength)) }))
        .sort((a, b) => b.points - a.points);
      return {
        friend, mode, pinned: pinned.has(friend.userId),
        score: Math.round(weighed.reduce((sum, item) => sum + item.points, 0)),
        reasons: weighed.map(item => item.reason).filter(reason => reason.label),
      };
    }).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.score - a.score
      || Number(!!b.mode) - Number(!!a.mode) || a.friend.displayName.localeCompare(b.friend.displayName, "vi"));
  }
}

/** Friends that get a large card: the pinned ones and those with a reason beyond having a mode on. */
export function featured<Friend extends RankedFriend>(ranked: readonly Friend[], limit = 6): Friend[] {
  return ranked.filter(item => item.pinned || item.reasons.some(reason => reason.kind !== "mode")).slice(0, limit);
}
