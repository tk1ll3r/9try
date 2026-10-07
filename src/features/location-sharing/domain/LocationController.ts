import type { OwnedLocationSession } from "../../../shared/infrastructure/AppData";

export interface LocationState {
  sessions: OwnedLocationSession[];
  pending: boolean;
  loading: boolean;
  status: string;
  error: string;
}
interface Dependencies {
  list: () => Promise<OwnedLocationSession[]>;
  start: (duration: number, recipients: string[], approximate: boolean) => Promise<string>;
  stop: (id: string) => Promise<unknown>;
  publish: (id: string, position: GeolocationPosition, approximate: boolean) => Promise<unknown>;
  gps: Pick<Geolocation, "watchPosition" | "clearWatch"> | undefined;
  changed: (state: LocationState) => void;
}

export class LocationController {
  private state: LocationState = { sessions: [], pending: false, loading: true, status: "Chưa chia sẻ.", error: "" };
  private disposed = false;
  private watch: number | null = null;
  private watchedId: string | null = null;
  private generation = 0;
  private refreshVersion = 0;
  private lastSent: { at: number; lat: number; lon: number } | null = null;
  constructor(private deps: Dependencies) {}

  private update(patch: Partial<LocationState>) {
    this.state = { ...this.state, ...patch };
    if (!this.disposed) this.deps.changed(this.state);
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
      if (!this.disposed && version === this.refreshVersion) this.update({ loading: false, error: message(e, "Không tải được phiên chia sẻ. Hãy thử lại.") });
    }
  }
  private clearWatcher() {
    this.generation++;
    if (this.watch !== null) this.deps.gps?.clearWatch(this.watch);
    this.watch = null; this.watchedId = null; this.lastSent = null;
  }
  async start(duration: number, recipients: string[], approximate: boolean) {
    if (this.disposed || this.state.pending || this.state.loading || this.state.sessions.length) return;
    if (!this.deps.gps) { this.update({ error: "Trình duyệt không hỗ trợ định vị." }); return; }
    this.update({ pending: true, error: "" });
    ++this.refreshVersion;
    let createdId: string | null = null;
    try {
      const id = await this.deps.start(duration, recipients, approximate);
      createdId = id;
      if (this.disposed) { await this.deps.stop(id); return; }
      this.update({ sessions: [...this.state.sessions, { id, approximate, expires_at: new Date(Date.now() + duration * 60_000).toISOString() }], status: "Đang yêu cầu quyền vị trí…" });
      this.watchedId = id;
      const generation = ++this.generation;
      this.watch = this.deps.gps.watchPosition(position => {
        if (this.disposed || generation !== this.generation) return;
        const session = this.state.sessions.find(s => s.id === id);
        if (!session || Date.parse(session.expires_at) <= Date.now()) { this.clearWatcher(); void this.refresh(); return; }
        const now = Date.now();
        this.update({ status: `GPS nhận lúc ${new Date(position.timestamp).toLocaleTimeString("vi-VN")} · ±${Math.round(position.coords.accuracy)} m` });
        const previous = this.lastSent;
        if (previous && (now - previous.at < 15_000 || (distanceMeters(previous.lat, previous.lon, position.coords.latitude, position.coords.longitude) < 25 && now - previous.at < 60_000))) return;
        this.lastSent = { at: now, lat: position.coords.latitude, lon: position.coords.longitude };
        void this.deps.publish(id, position, approximate).catch(e => {
          if (!this.disposed && generation === this.generation) this.update({ error: message(e, "Không cập nhật được vị trí.") });
        });
      }, error => {
        if (this.disposed || generation !== this.generation) return;
        if (error.code === 1) {
          this.clearWatcher();
          this.update({ error: "Bạn đã từ chối định vị. Đang thu hồi phiên…" });
          queueMicrotask(() => { void this.stop(id); });
        } else this.update({ error: `Không lấy được vị trí: ${error.message}` });
      }, { enableHighAccuracy: !approximate, maximumAge: 15_000, timeout: 20_000 });
    } catch (e) {
      this.clearWatcher();
      if (createdId && !this.disposed) {
        try { await this.deps.stop(createdId); this.update({ sessions: this.state.sessions.filter(s => s.id !== createdId) }); }
        catch { /* Retain session with a stop button if cleanup fails. */ }
      }
      this.update({ error: message(e, "Không bắt đầu được chia sẻ.") });
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
      this.update({ sessions: this.state.sessions.filter(s => s.id !== id), status: "Đã dừng phiên và xóa vị trí gần nhất." });
    } catch (e) { this.update({ error: message(e, "Chưa thu hồi được phiên trên máy chủ. Bấm Dừng để thử lại.") }); }
    finally { this.update({ pending: false }); }
  }
  dispose() { this.disposed = true; ++this.refreshVersion; this.clearWatcher(); }
}
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => value * Math.PI / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
