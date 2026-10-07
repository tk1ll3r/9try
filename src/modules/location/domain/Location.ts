import type { FriendSignal } from "../../../kernel/module";

/** A sharing session the signed-in user started and has not stopped. */
export interface OwnedLocationSession {
  id: string;
  expires_at: string;
  approximate: boolean;
}

/** A friend's session that includes the signed-in user, with the latest position if there is one. */
export interface VisibleLocation {
  sessionId: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerUsername: string | null;
  expiresAt: string;
  approximate: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  recordedAt: string | null;
}

export interface LocationRepository {
  listOwned(): Promise<OwnedLocationSession[]>;
  /** Starts a session for these friends and returns its id. */
  start(durationMinutes: number, recipientIds: string[], approximate: boolean): Promise<string>;
  /** Ends the session and deletes its stored position. */
  stop(sessionId: string): Promise<void>;
  /** Stores the latest position. Approximate sessions round it before it leaves the device. */
  publish(sessionId: string, position: GeolocationPosition, approximate: boolean): Promise<void>;
  listVisible(): Promise<VisibleLocation[]>;
  /** Sends a friend a notification asking them to share. Nothing is shared by this call. */
  ask(userId: string): Promise<void>;
}

/** A friend who shares their location with the user right now. A position older than a minute counts for less. */
export function locationSignals(visible: readonly VisibleLocation[], now: Date): FriendSignal[] {
  return visible.map(item => ({
    userId: item.ownerId, kind: "location", label: "Đang chia sẻ vị trí", to: "/me/location",
    strength: item.recordedAt && now.getTime() - Date.parse(item.recordedAt) < 60_000 ? 1 : 0.6,
  }));
}
