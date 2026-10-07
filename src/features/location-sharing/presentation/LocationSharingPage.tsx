import { LocateFixed, MapPinOff, ShieldCheck, Users } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { appData, type VisibleLocation } from "../../../shared/infrastructure/AppData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";
import { LocationController, type LocationState } from "../domain/LocationController";
import { MapCanvas } from "./MapCanvas";

const emptySharing: LocationState = { sessions: [], pending: false, loading: true, status: "Chưa chia sẻ.", error: "" };
export function LocationSharingPage() {
  const { user } = useAuth();
  const controller = useRef<LocationController | null>(null);
  const [sharingData, setSharingData] = useState<{ owner?: string; state: LocationState }>({ state: emptySharing });
  const sharing = sharingData.owner === user?.id ? sharingData.state : emptySharing;
  const [names, setNames] = useState("");
  const [duration, setDuration] = useState(60);
  const [approximate, setApproximate] = useState(false);
  const [locationData, setLocationData] = useState<{ owner?: string; items: VisibleLocation[] }>({ items: [] });
  const visible = locationData.owner === user?.id ? locationData.items : [];
  const [recipientError, setRecipientError] = useState("");
  const [recipientLoading, setRecipientLoading] = useState(true);
  const [focus, setFocus] = useState<{ id: string; sequence: number } | undefined>();
  const scope = useRef(new AsyncOwnerScope());

  async function refreshVisible() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    try {
      const items = await appData.listVisibleLocations();
      if (current()) { setLocationData({ owner: user.id, items }); setRecipientError(""); }
    } catch { if (current()) setRecipientError("Không tải được người chia sẻ. Dữ liệu đang hiển thị có thể đã cũ; hãy thử lại."); }
    finally { if (current()) setRecipientLoading(false); }
  }
  useEffect(() => {
    scope.current.activate(user?.id);
    setLocationData({ owner: user?.id, items: [] }); setRecipientError(""); setRecipientLoading(true); setFocus(undefined); setNames("");
    void refreshVisible();
    const interval = window.setInterval(() => void refreshVisible(), 15_000);
    return () => { scope.current.dispose(); window.clearInterval(interval); };
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    setSharingData({ owner: user.id, state: emptySharing });
    const current = new LocationController({
      list: () => appData.listOwnedLocationSessions(user.id),
      start: (minutes, recipients, near) => appData.startLocation(minutes, recipients, near),
      stop: id => appData.stopLocation(id),
      publish: (id, position, near) => appData.publishLocation(id, position, near),
      gps: navigator.geolocation,
      changed: state => setSharingData({ owner: user.id, state }),
    });
    controller.current = current;
    void current.refresh();
    const interval = window.setInterval(() => void current.refresh(), 15_000);
    return () => { window.clearInterval(interval); current.dispose(); controller.current = null; };
  }, [user?.id]);

  function start(event: FormEvent) {
    event.preventDefault();
    const recipients = names.split(",").map(value => value.trim()).filter(Boolean);
    void controller.current?.start(duration, recipients, approximate);
  }
  const points = visible.filter(item => item.latitude != null && item.longitude != null).map(item => ({
    id: item.sessionId, name: item.ownerDisplayName, latitude: item.latitude!, longitude: item.longitude!,
    stale: isStale(item), approximate: item.approximate,
  }));
  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">Tắt mặc định · có thời hạn · chủ động thu hồi</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Chia sẻ vị trí</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Xem những người đã chọn chia sẻ với bạn. Không tự bật GPS hoặc công khai vị trí.</p>
    </header>
    <div className="flex gap-3 rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]"><ShieldCheck className="mt-0.5 shrink-0" size={20} />
      <p>Chỉ người bạn chọn được xem phiên. Máy chủ giữ vị trí mới nhất; dừng phiên sẽ xóa vị trí đó.</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
      <MapCanvas ownerKey={user?.id ?? "signed-out"} points={points} focusRequest={focus} />
      <div className="space-y-5">
        <Card title={sharing.sessions.length ? "Phiên chia sẻ của bạn" : "Chia sẻ với người bạn chọn"}>
          {sharing.loading && <p role="status">Đang kiểm tra phiên đang mở…</p>}
          {sharing.error && <div role="alert" className="mb-3 text-sm text-red-700">{sharing.error}<Button variant="ghost" disabled={sharing.pending} onClick={() => void controller.current?.refresh()}>Thử tải lại phiên</Button></div>}
          <p role="status" className="mb-3 text-sm">{sharing.status}</p>
          {sharing.sessions.length ? sharing.sessions.map(session => <div key={session.id} className="mb-3 rounded-xl bg-[var(--soft)] p-3">
            <p className="text-sm">Hết hạn: {new Date(session.expires_at).toLocaleString("vi-VN")}{session.approximate ? " · gần đúng" : ""}</p>
            <Button variant="danger" disabled={sharing.pending} className="mt-3 w-full" onClick={() => void controller.current?.stop(session.id)}><MapPinOff size={18} /> Dừng phiên này</Button>
          </div>) : <form onSubmit={start} className="space-y-3">
            <label className="block text-sm font-semibold">Người nhận<input className="field mt-1 w-full" required value={names} onChange={e => setNames(e.target.value)} placeholder="Username, cách nhau dấu phẩy" /></label>
            <label className="block text-sm font-semibold">Thời hạn<select className="field mt-1 w-full" value={duration} onChange={e => setDuration(Number(e.target.value))}>
              <option value={30}>30 phút</option><option value={60}>1 giờ</option><option value={180}>3 giờ</option><option value={480}>8 giờ</option>
            </select></label>
            <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={approximate} onChange={e => setApproximate(e.target.checked)} /> Chia sẻ vị trí gần đúng</label>
            <Button className="w-full" type="submit" disabled={sharing.pending || sharing.loading || !!sharing.error}><LocateFixed size={18} /> Bắt đầu chia sẻ</Button>
          </form>}
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Rời trang/reload ngừng cập nhật GPS, nhưng vị trí gần nhất vẫn có thể được xem đến khi hết hạn hoặc bạn dừng. Reload không tự bật GPS. Vị trí gần đúng không bảo đảm một bán kính sai số cố định. Trình duyệt không bảo đảm tracking nền.</p>
        </Card>
        <Card title="Người chia sẻ với bạn" action={<Users size={18} />}>
          {recipientLoading && <p role="status">Đang tải người chia sẻ…</p>}
          {recipientError && <div role="alert" className="mb-3 text-sm text-red-700">{recipientError}<Button variant="ghost" onClick={() => void refreshVisible()}>Thử tải lại danh sách</Button></div>}
          {!recipientLoading && !recipientError && !visible.length && <p className="py-4 text-sm text-[var(--muted)]">Chưa có ai chia sẻ. Bản đồ vẫn hoạt động; không cần bật GPS để xem.</p>}
          <div className="space-y-3">{visible.map(item => <article key={item.sessionId} className="rounded-2xl bg-[var(--soft)] p-3">
            <div className="flex items-start justify-between gap-2"><b>{item.ownerDisplayName}</b><span className="text-xs text-[var(--muted)]">{item.recordedAt ? isStale(item) ? "Vị trí cũ" : "Mới cập nhật" : "Chưa có GPS"}</span></div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.recordedAt ? `${new Date(item.recordedAt).toLocaleTimeString("vi-VN")} · ±${Math.round(item.accuracyM ?? 0)} m` : "Chờ vị trí đầu tiên"}{item.approximate ? " · gần đúng" : ""}<br />Hết hạn: {new Date(item.expiresAt).toLocaleString("vi-VN")}</p>
            <Button variant="ghost" disabled={item.latitude == null || item.longitude == null} onClick={() => setFocus(previous => ({ id: item.sessionId, sequence: (previous?.sequence ?? 0) + 1 }))}>Xem trên bản đồ</Button>
          </article>)}</div>
        </Card>
      </div>
    </div>
  </div>;
}
function isStale(item: VisibleLocation) { return !item.recordedAt || Date.now() - Date.parse(item.recordedAt) > 2 * 60_000; }
