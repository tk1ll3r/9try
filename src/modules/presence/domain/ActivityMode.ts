export const activityModes = ["studying", "school", "gaming", "billiards", "drinks", "sleeping"] as const;
export type ActivityMode = typeof activityModes[number];

/** What someone says they are doing until `expiresAt`. People choose it themselves; it is never derived from GPS. */
export interface ActiveMode {
  userId: string;
  mode: ActivityMode;
  expiresAt: string;
}

export interface PresenceRepository {
  /** The running modes of the signed-in user and of their friends. */
  list(): Promise<ActiveMode[]>;
  /** Sets the signed-in user's mode for `minutes`, or clears it with `null`. */
  set(mode: ActivityMode | null, minutes: number): Promise<void>;
}
