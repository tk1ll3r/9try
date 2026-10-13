/** The page as the heartbeat needs it, so that a test can stand in for the browser. */
export interface PageWatch {
  /** Whether the app is on screen right now. */
  visible(): boolean;
  /** Calls `listener` whenever that may have changed. Returns a function that stops it. */
  onChange(listener: () => void): () => void;
}

interface Dependencies {
  beat(sessionId: string): Promise<boolean>;
  leave(sessionId: string): void;
  page: PageWatch;
  /** A new id for this tab. */
  sessionId: string;
  everyMs?: number;
}

/**
 * Tells the server "this tab is open" every 30 seconds while the app is on screen, and "this tab is
 * going away" when it is hidden, closed or signed out. The server treats a tab that stopped calling
 * as inactive after 90 seconds, so a lost connection or a killed browser needs no goodbye.
 *
 * It starts by calling once. The server answers whether the person shares their presence at all;
 * when they do not, nothing more is sent until `sharingChanged(true)`.
 */
export class OnlineHeartbeat {
  private timer: ReturnType<typeof setInterval> | undefined;
  private stopWatching: (() => void) | undefined;
  private sharing = true;
  /** Whether the server has this tab as open. */
  private open = false;

  constructor(private readonly deps: Dependencies) {}

  start() {
    if (this.stopWatching) return;
    this.stopWatching = this.deps.page.onChange(() => this.sync());
    this.sync();
  }

  /** Call when the person turns sharing on or off on this device. */
  sharingChanged(on: boolean) {
    this.sharing = on;
    this.sync();
  }

  dispose() {
    this.stopWatching?.();
    this.stopWatching = undefined;
    this.sharing = false;
    this.sync();
  }

  private sync() {
    const wanted = this.sharing && !!this.stopWatching && this.deps.page.visible();
    if (wanted && !this.timer) {
      void this.beat();
      this.timer = setInterval(() => void this.beat(), this.deps.everyMs ?? 30_000);
    }
    if (!wanted && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.goodbye();
    }
  }

  private goodbye() {
    if (!this.open) return;
    this.open = false;
    this.deps.leave(this.deps.sessionId);
  }

  private async beat() {
    try {
      const shared = await this.deps.beat(this.deps.sessionId);
      if (!shared) { this.sharing = false; this.sync(); return; }
      this.open = true;
      // The page was hidden while the call was on its way: the server now has the tab as open again.
      if (!this.timer) this.goodbye();
    } catch { /* No connection, or a server without presence. The next beat tries again. */ }
  }
}
