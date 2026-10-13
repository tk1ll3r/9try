import type { FriendSignal } from "../../../kernel/module";
import { t } from "../../../kernel/i18n";

/** A sharing session the signed-in user started and has not stopped. */
export interface OwnedLocationSession {
  id: string;
  expires_at: string;
  approximate: boolean;
  permanent?: boolean;
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
  /** Starts a session for these friends. `null` duration means it stays open until the owner stops it. */
  start(durationMinutes: number | null, recipientIds: string[], approximate: boolean): Promise<string>;
  /** Ends the session and deletes its stored position. */
  stop(sessionId: string): Promise<void>;
  /** Stores the latest position. Approximate sessions round it before it leaves the device. */
  publish(sessionId: string, position: GeolocationPosition, approximate: boolean): Promise<void>;
  listVisible(): Promise<VisibleLocation[]>;
  /** Sends a friend a notification asking them to share. Nothing is shared by this call. */
  ask(userId: string): Promise<void>;
  nearbyPreference(): Promise<LocationNearbyPreference>;
  saveNearbyPreference(preference: LocationNearbyPreference): Promise<void>;
}

export interface LocationNearbyPreference {
  radiusM: number;
  repeatMinutes: number;
}

export const defaultNearbyPreference: LocationNearbyPreference = { radiusM: 500, repeatMinutes: 30 };

/** PostgreSQL serializes an unbounded timestamptz as the string "infinity". */
export function isPermanentLocation(session: Pick<OwnedLocationSession, "expires_at"> & Partial<Pick<OwnedLocationSession, "permanent">>): boolean {
  return !!session.permanent || session.expires_at === "infinity";
}

/** A point on the ground. */
export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** Metres between two points in a straight line over the ground. Not a route, and not a travel time. */
export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const a = Math.sin(radians(to.latitude - from.latitude) / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** A position older than this is drawn grey: the person may have closed the app. */
export const staleAfterMs = 60_000;

/** "live": sent within the last minute. "stale": older than that. "none": the session has no position yet. */
export type Freshness = "live" | "stale" | "none";

export function freshness(item: Pick<VisibleLocation, "recordedAt">, now: number): Freshness {
  if (!item.recordedAt) return "none";
  return now - Date.parse(item.recordedAt) > staleAfterMs ? "stale" : "live";
}

/**
 * How far a friend is from `from`, and whether that number is rough. It is rough when either end is:
 * the friend shares a rounded position, or the viewer's own position is known to 100 m or worse.
 * A rough distance is given in steps of 100 m, so it does not look more exact than it is.
 */
export function distanceTo(item: VisibleLocation, from: Coordinates & { accuracyM: number }): { meters: number; rough: boolean } | null {
  if (item.latitude == null || item.longitude == null) return null;
  const meters = distanceMeters(from, { latitude: item.latitude, longitude: item.longitude });
  const rough = item.approximate || from.accuracyM >= 100;
  return { meters: rough ? Math.max(100, Math.round(meters / 100) * 100) : meters, rough };
}

/** A friend who shares their location with the user right now. A position older than a minute counts for less. */
export function locationSignals(visible: readonly VisibleLocation[], now: Date): FriendSignal[] {
  return visible.map(item => ({
    userId: item.ownerId, kind: "location", label: t("Đang chia sẻ vị trí"), to: "/me/location",
    strength: freshness(item, now.getTime()) === "live" ? 1 : 0.6,
  }));
}
