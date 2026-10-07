/**
 * The key of an activity, such as "studying". The catalog of activities (name, icon, color) is in
 * `presentation/modes.ts`; the server stores any key of this shape, so a new activity needs no migration.
 */
export type ActivityMode = string;

/** What someone says they are doing until `expiresAt`. People choose it themselves; it is never derived from GPS. */
export interface ActiveMode {
  userId: string;
  mode: ActivityMode;
  /** When the mode was set, and when it ends by itself. */
  startedAt: string;
  expiresAt: string;
}

/** How much of a mode's time is left at `now`, from 1 (just set) down to 0 (over). */
export function remainingShare(mode: ActiveMode, now: number): number {
  const total = Date.parse(mode.expiresAt) - Date.parse(mode.startedAt);
  return total > 0 ? Math.min(1, Math.max(0, (Date.parse(mode.expiresAt) - now) / total)) : 0;
}

export interface PresenceRepository {
  /** The running modes of the signed-in user and of their friends. */
  list(): Promise<ActiveMode[]>;
  /** Sets the signed-in user's mode for `minutes`, or clears it with `null`. */
  set(mode: ActivityMode | null, minutes: number): Promise<void>;
}
