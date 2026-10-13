import { locale, t } from "../../../kernel/i18n";

/** Who may see whether the app is open on one of a person's devices. */
export type PresenceAudience = "nobody" | "friends" | "selected";

export interface OnlineSettings {
  audience: PresenceAudience;
  /** The friends who may see it when the audience is "selected". */
  viewerIds: string[];
  /** Whether the time the person was last seen is kept and shown. */
  showLastActive: boolean;
}

export const notShared: OnlineSettings = { audience: "nobody", viewerIds: [], showLastActive: false };

/**
 * What the app has lately seen of a friend who shares it: "active" is a sign of life in the last 90
 * seconds, "recent" one in the last 15 minutes. It says that the app was open, not that the person is
 * free, and it is neither their activity mode nor where they are.
 */
export interface OnlineFriend {
  userId: string;
  state: "active" | "recent" | "idle";
  /** Only from a friend who chose to show it. */
  lastActiveAt: string | null;
}

export interface OnlineRepository {
  settings(): Promise<OnlineSettings>;
  save(settings: OnlineSettings): Promise<void>;
  /** The friends who let the signed-in user see them. A friend who is not in the list does not share. */
  friends(): Promise<OnlineFriend[]>;
  /** "This tab is open." Resolves with false when the person does not share their presence. */
  beat(sessionId: string): Promise<boolean>;
  /** "This tab is going away." Does not wait for an answer: it is called while the page closes. */
  leave(sessionId: string): void;
}

/**
 * The words for a friend's presence. A friend who does not share, and one who has been away for a
 * while without showing when they were last seen, are both "status unavailable": the app cannot tell
 * these apart from a phone that is switched off, and does not pretend to.
 */
export function onlineLabel(friend: OnlineFriend | undefined, now: Date): string {
  if (friend?.state === "active") return t("Đang mở ứng dụng");
  if (friend?.state === "recent") return t("Vừa mở ứng dụng");
  if (!friend?.lastActiveAt) return t("Không rõ trạng thái");
  const last = new Date(friend.lastActiveAt);
  const sameDay = last.toDateString() === now.toDateString();
  return t("Mở ứng dụng lần cuối {0}", last.toLocaleString(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric" }));
}
