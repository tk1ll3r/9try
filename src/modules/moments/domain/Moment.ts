import type { FriendSignal } from "../../../kernel/module";
import { t } from "../../../kernel/i18n";
import type { CustomModeIcon } from "../../presence";

export type Reaction = "heart" | "laugh" | "wow" | "sad" | "fire" | "like";
/** The six reactions in the order they are offered, each with the sign a person sees. */
export const reactionSigns: readonly (readonly [Reaction, string])[] = [["heart", "❤️"], ["laugh", "😂"], ["wow", "😮"], ["sad", "😢"], ["fire", "🔥"], ["like", "👍"]];
export const signOf = (reaction: string | null | undefined) => reactionSigns.find(([key]) => key === reaction)?.[1] ?? "";

/** A photo is redrawn to this before it leaves the device. The bucket takes 512 kB at most. */
export const photoLimits = { maxSide: 1080, maxBytes: 300_000 } as const;
export const captionLength = 80;

export interface MomentRelationshipTag { userId: string; name: string; relationship: string }

/** A photo someone posted for their friends. It is gone 24 hours after it was posted. */
export interface Moment {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  /** The name of its file in the bucket. */
  path: string;
  /** The key of the activity its owner had on, when they attached one. */
  mode: string | null;
  /** A snapshot for custom activities, whose label or icon may later change. */
  modeLabel?: string | null;
  modeIcon?: CustomModeIcon | null;
  modeColor?: string | null;
  caption: string;
  width: number;
  height: number;
  createdAt: string;
  expiresAt: string;
  audience: "friends" | "selected";
  /** Mutual relationship the owner chose to show on this photo. */
  relationshipTag: MomentRelationshipTag | null;
  mine: boolean;
  /** The signed-in person has looked at it. Always true for their own. */
  seen: boolean;
  myReaction: Reaction | null;
  /** For one's own photo: how many people looked, and how many reacted with what. */
  views: number;
  reactions: Partial<Record<Reaction, number>>;
}

export interface MomentViewer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  seenAt: string;
  reaction: Reaction | null;
}

/** A durable archive entry; the same photo can still be live in the separate 24-hour story feed. */
export interface ArchivedMoment {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  path: string;
  mode: string | null;
  modeLabel?: string | null;
  modeIcon?: Moment["modeIcon"];
  modeColor?: string | null;
  caption: string;
  width: number;
  height: number;
  createdAt: string;
  audience: "friends" | "selected";
  relationshipTag: MomentRelationshipTag | null;
  mine: boolean;
}

export interface MomentArchiveCursor { createdAt: string; id: string }
export interface MomentArchivePage { items: ArchivedMoment[]; next: MomentArchiveCursor | null }
export interface MomentArchivePerson {
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  photoCount: number;
  mine: boolean;
}

export interface MomentDraft {
  blob: Blob;
  width: number;
  height: number;
  mode: string | null;
  caption: string;
  /** The friends it is for, or null for every friend. A list is never widened: an empty one is for nobody. */
  viewerIds: string[] | null;
  /** The accepted shared relationship to show on the photo, if the owner chooses one. */
  relationshipUserId: string | null;
  /** Activate a newly attached activity in the same transaction as posting the photo. */
  activateMode: boolean;
  modeMinutes: number;
}

export interface MomentRepository {
  /** The photos the signed-in person may see right now, their own among them. */
  list(): Promise<Moment[]>;
  /** Cursor-paged archive, newest first. */
  archive(before?: MomentArchiveCursor, ownerId?: string): Promise<MomentArchivePage>;
  /** Every photographer whose archived photos the signed-in person may see, with the full count. */
  archivePeople(): Promise<MomentArchivePerson[]>;
  /** Where the photos can be loaded from for the next hour, by the name of the file. */
  addresses(paths: readonly string[]): Promise<Map<string, string>>;
  /** Downloads a photo the signed-in person is allowed to see. */
  download(path: string): Promise<Blob>;
  post(draft: MomentDraft): Promise<void>;
  see(id: string): Promise<void>;
  /** One reaction per person per photo; null takes it back. */
  react(id: string, reaction: Reaction | null): Promise<void>;
  /** Removes one's own photo for everyone, and its file. */
  remove(id: string): Promise<void>;
  /** For the owner of a photo: who looked at it. */
  viewers(id: string): Promise<MomentViewer[]>;
  /** Current 3+ day streaks for the caller and friends who may see the badge. */
  streakBadges(): Promise<Map<string, number>>;
}

/** The photos that are not over at `now`. The server stops showing a photo at the same moment. */
export const live = (moments: readonly Moment[], now: number) => moments.filter(moment => Date.parse(moment.expiresAt) > now);

/** Newest first, with an ID tie-break so equal server timestamps never shuffle between reads. */
export function frameOrder(moments: readonly Moment[], now: number): Moment[] {
  return live(moments, now).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

export interface PersonMoments {
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  mine: boolean;
  unseen: number;
  /** In the order they were taken. */
  moments: Moment[];
}

/** Each person's photos oldest first; people are ordered by the time of their newest photo. */
export function byPerson(moments: readonly Moment[], now: number): PersonMoments[] {
  const people = new Map<string, PersonMoments>();
  for (const moment of live(moments, now).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id))) {
    const person = people.get(moment.ownerId) ?? { ownerId: moment.ownerId, ownerName: moment.ownerName, ownerAvatarUrl: moment.ownerAvatarUrl, mine: moment.mine, unseen: 0, moments: [] };
    person.moments.push(moment);
    if (!moment.seen) person.unseen++;
    people.set(moment.ownerId, person);
  }
  const newest = (person: PersonMoments) => person.moments[person.moments.length - 1];
  return [...people.values()].sort((a, b) => Date.parse(newest(b).createdAt) - Date.parse(newest(a).createdAt)
    || newest(b).id.localeCompare(newest(a).id)
    || a.ownerId.localeCompare(b.ownerId));
}

/** The reader opens at the oldest unseen photo, or the newest photo after all have been seen. */
export function openingMoment(person: PersonMoments): Moment {
  return person.moments.find(moment => !moment.seen) ?? person.moments[person.moments.length - 1];
}

/** How many photos past the one on screen to fetch before a swipe gets there: the next one, and the one after it. */
export const storyAhead = 2;
/** How many files to start from one screen. Eight covers a fast run without pulling a whole day of photos at the door. */
export const warmCap = 8;

function takeUnique(paths: readonly string[], cap: number): string[] {
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    picked.push(path);
    if (picked.length >= cap) break;
  }
  return picked;
}

/** The file on screen, the one just left, and `ahead` more. A swipe back or forward lands on a file already asked for. */
export function photosToWarm(paths: readonly string[], index: number, ahead = storyAhead): string[] {
  if (paths.length === 0) return [];
  const at = Math.min(paths.length - 1, Math.max(0, index));
  return paths.slice(Math.max(0, at - 1), at + 1 + ahead);
}

/**
 * The home frame. The short run around the photo on screen comes first, then the photo each next
 * person opens on, until `cap`. Tapping a face uses a file the home screen already started.
 */
export function homeWarmPaths(frame: readonly string[], index: number, openings: readonly string[], cap = warmCap): string[] {
  return takeUnique([...photosToWarm(frame, index), ...openings], cap);
}

/**
 * One person's reel. The run around the photo on screen, then the next person's opening photo,
 * then the rest of this reel, until `cap`. Finishing this person, or skipping to the next, is already on the way.
 */
export function viewerWarmPaths(personPaths: readonly string[], index: number, nextOpening?: string | null, cap = warmCap): string[] {
  if (personPaths.length === 0) return takeUnique(nextOpening ? [nextOpening] : [], cap);
  const at = Math.min(personPaths.length - 1, Math.max(0, index));
  const rest = personPaths.slice(at + 1 + storyAhead);
  return takeUnique([...photosToWarm(personPaths, at), ...(nextOpening ? [nextOpening] : []), ...rest], cap);
}

/** "vừa xong", "12 phút trước", "3 giờ trước". */
export function ago(createdAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 60_000));
  if (minutes < 1) return t("vừa xong");
  return minutes < 60 ? t("{0} phút trước", minutes) : t("{0} giờ trước", Math.floor(minutes / 60));
}

/** A friend with a photo of the day moves up on the Mode screen. One taken within the hour counts in full. */
export function momentSignals(moments: readonly Moment[], now: Date): FriendSignal[] {
  const people = byPerson(moments, now.getTime()).filter(person => !person.mine).sort((a, b) =>
    Number(b.unseen > 0) - Number(a.unseen > 0)
    || Date.parse(b.moments[b.moments.length - 1].createdAt) - Date.parse(a.moments[a.moments.length - 1].createdAt)
    || a.ownerId.localeCompare(b.ownerId));
  return people.map(person => {
    const target = openingMoment(person);
    const newest = person.moments[person.moments.length - 1];
    const fresh = now.getTime() - Date.parse(newest.createdAt) < 3_600_000;
    return {
      userId: person.ownerId, kind: "moment", strength: fresh ? 1 : person.unseen ? 0.7 : 0.4,
      label: fresh ? t("Vừa đăng ảnh") : person.unseen ? t("Có ảnh mới") : t("Có ảnh hôm nay"), to: `/moments/${person.ownerId}/${target.id}`,
    };
  });
}
