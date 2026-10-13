import { distanceMeters, isPermanentLocation, type OwnedLocationSession } from "../domain/Location";
import { locale, t } from "../../../kernel/i18n";

export interface LocationState {
  sessions: OwnedLocationSession[];
  pending: boolean;
  loading: boolean;
  status: string;
  error: string;
}
interface Dependencies {
  list: () => Promise<OwnedLocationSession[]>;
  start: (duration: number | null, recipients: string[], approximate: boolean) => Promise<string>;
  stop: (id: string) => Promise<unknown>;
  publish: (id: string, position: GeolocationPosition, approximate: boolean) => Promise<unknown>;
  gps: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined;
  changed?: (state: LocationState) => void;
}

export class LocationController {
  private state: LocationState = { sessions: [], pending: false, loading: true, status: t("Chưa chia sẻ."), error: "" };
  private disposed = false;
  private watch: number | null = null;
  private watchedId: string | null = null;
  private generation = 0;
  private refreshVersion = 0;
  private lastSent: { at: number; lat: number; lon: number } | null = null;
  private listeners = new Set<() => void>();
  constructor(private deps: Dependencies) {}

  /** For React's useSyncExternalStore. */
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private update(patch: Partial<LocationState>) {
    this.state = { ...this.state, ...patch };
    if (this.disposed) return;
    this.deps.changed?.(this.state);
    this.listeners.forEach(listener => listener());
  }
  async refresh() {
    if (this.disposed || this.state.pending) return;
    const version = ++this.refreshVersion;
    try {
      const sessions = await this.deps.list();
      if (this.disposed || version !== this.refreshVersion) return;
      if (this.watchedId && !sessions.some(s => s.id === this.watchedId)) this.clearWatcher();
      this.update({ sessions, loading: false, error: "" });
    } catch (e) {
      if (!this.disposed && version === this.refreshVersion) this.update({ loading: false, error: message(e, t("Không tải được phiên chia sẻ. Hãy thử lại.")) });
    }
  }
  private clearWatcher() {
    this.generation++;
    if (this.watch !== null) this.deps.gps?.clearWatch(this.watch);
    this.watch = null; this.watchedId = null; this.lastSent = null;
  }
  async start(duration: number | null, recipients: string[], approximate: boolean) {
    if (this.disposed || this.state.pending || this.state.loading || this.state.sessions.length) return;
    if (!this.deps.gps) { this.update({ error: t("Trình duyệt không hỗ trợ định vị.") }); return; }
    this.update({ pending: true, error: "" });
    ++this.refreshVersion;
    let createdId: string | null = null;
    try {
      const id = await this.deps.start(duration, recipients, approximate);
      createdId = id;
      if (this.disposed) { await this.deps.stop(id); return; }
      this.update({ sessions: [...this.state.sessions, {
        id, approximate, permanent: duration === null,
        expires_at: duration === null ? "infinity" : new Date(Date.now() + duration * 60_000).toISOString(),
      }], status: t("Đang yêu cầu quyền vị trí…") });
      this.watchedId = id;
      const generation = ++this.generation;
      this.watch = this.deps.gps.watchPosition(position => {
        if (this.disposed || generation !== this.generation) return;
        const session = this.state.sessions.find(s => s.id === id);
        if (!session || (!isPermanentLocation(session) && Date.parse(session.expires_at) <= Date.now())) { this.clearWatcher(); void this.refresh(); return; }
        const now = Date.now();
        this.update({ status: t("GPS nhận lúc {0} · ±{1} m", new Date(position.timestamp).toLocaleTimeString(locale), Math.round(position.coords.accuracy)) });
        const previous = this.lastSent;
        // At most one position every 5 s while moving, and one every 30 s while standing still.
        if (previous && (now - previous.at < 5_000 || (distanceMeters({ latitude: previous.lat, longitude: previous.lon }, position.coords) < 10 && now - previous.at < 30_000))) return;
        this.lastSent = { at: now, lat: position.coords.latitude, lon: position.coords.longitude };
        void this.deps.publish(id, position, approximate).catch(e => {
          if (!this.disposed && generation === this.generation) this.update({ error: message(e, t("Không cập nhật được vị trí.")) });
        });
      }, error => {
        if (this.disposed || generation !== this.generation) return;
        if (error.code === 1) {
          this.clearWatcher();
          this.update({ error: t("Bạn đã từ chối định vị. Đang thu hồi phiên…") });
          queueMicrotask(() => { void this.stop(id); });
        } else this.update({ error: t("Không lấy được vị trí: {0}", error.message) });
      }, { enableHighAccuracy: !approximate, maximumAge: 5_000, timeout: 20_000 });
    } catch (e) {
      this.clearWatcher();
      if (createdId && !this.disposed) {
        try { await this.deps.stop(createdId); this.update({ sessions: this.state.sessions.filter(s => s.id !== createdId) }); }
        catch { /* Retain session with a stop button if cleanup fails. */ }
      }
      this.update({ error: message(e, t("Không bắt đầu được chia sẻ.")) });
    } finally { this.update({ pending: false }); }
  }
  async stop(id: string) {
    if (this.disposed || this.state.pending) return;
    this.update({ pending: true, error: "" });
    ++this.refreshVersion;
    if (this.watchedId === id) this.clearWatcher();
    try {
      await this.deps.stop(id);
      if (this.disposed) return;
      this.update({ sessions: this.state.sessions.filter(s => s.id !== id), status: t("Đã dừng phiên và xóa vị trí gần nhất.") });
    } catch (e) { this.update({ error: message(e, t("Chưa thu hồi được phiên trên máy chủ. Bấm Dừng để thử lại.")) }); }
    finally { this.update({ pending: false }); }
  }
  dispose() { this.disposed = true; ++this.refreshVersion; this.clearWatcher(); }
}
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
