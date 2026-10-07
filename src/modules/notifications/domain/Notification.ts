/** One entry of the in-app notification center. */
export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  actionPath: string | null;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  categoryPush: Record<string, boolean>;
}

/** The signed-in user's notification center. */
export interface NotificationRepository {
  /** `pageSize` notifications starting at offset `from`, newest first. */
  list(from: number, pageSize: number): Promise<AppNotification[]>;
  countUnread(): Promise<number>;
  markRead(id: string): Promise<void>;
  /** Asks the server to notify the user at `dueAt`. The notification opens `actionPath`. */
  scheduleReminder(reminder: { dueAt: Date; title: string; body: string; actionPath: string }): Promise<void>;
}

/**
 * Where a notification may take the user. `actionPath` is database text, so it only counts
 * when `safePath` recognizes it as a route of the app.
 */
export function notificationTarget(actionPath: string | null, safePath: (path: string) => string): string | null {
  if (!actionPath) return null;
  const safe = safePath(actionPath);
  return safe !== "/" || actionPath === "/" ? safe : null;
}
