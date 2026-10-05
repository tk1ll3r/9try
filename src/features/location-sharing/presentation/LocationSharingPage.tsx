import { Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MapPinOff, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { appData, type VisibleLocation } from "../../../shared/infrastructure/AppData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

const STALE_AFTER_MS = 2 * 60 * 1000;
const MIN_SEND_INTERVAL_MS = 15_000;
const MIN_MOVE_METERS = 25;

export function LocationSharingPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const map = useRef<Map | null>(null);
  const markers = useRef<Marker[]>([]);
  const watch = useRef<number | null>(null);
  const lastSent = useRef<{ at: number; lat: number; lon: number } | null>(null);

  const [session, setSession] = useState<string | null>(null);
  const [names, setNames] = useState("");
  const [duration, setDuration] = useState(60);
  const [approximate, setApproximate] = useState(false);
  const [status, setStatus] = useState("Chưa chia sẻ.");
  const [visible, setVisible] = useState<VisibleLocation[]>([]);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;
    map.current = new Map({
      container: mapContainer.current,
      style: (import.meta.env.VITE_MAP_STYLE_URL as string | undefined) ?? "https://tiles.openfreemap.org/styles/liberty",
      center: [106.66, 10.78],
      zoom: 10,
    });
    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  async function refreshVisible() {
    try {
      setVisible(await appData.listVisibleLocations());
    } catch {
      setVisible([]);
    }
  }

  useEffect(() => {
    void refreshVisible();
    const id = window.setInterval(() => void refreshVisible(), 15_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];

    const usable = visible.filter((item) => item.latitude != null && item.longitude != null);
    for (const item of usable) {
      const marker = new Marker({ color: isStale(item) ? "#9ca3af" : "#171a12" })
        .setLngLat([item.longitude!, item.latitude!])
        .addTo(map.current!);
      markers.current.push(marker);
    }

    if (usable[0] && map.current) {
      map.current.flyTo({ center: [usable[0].longitude!, usable[0].latitude!], zoom: 13, essential: false });
    }
  }, [visible]);

  useEffect(() => () => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
  }, []);

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!navigator.geolocation) {
      setStatus("Thiết bị hoặc trình duyệt không hỗ trợ định vị.");
      return;
    }

    try {
      const recipients = names.split(",").map((value) => value.trim()).filter(Boolean);
      const id = await appData.startLocation(duration, recipients, approximate);
      setSession(id);
      setStatus("Đang yêu cầu quyền vị trí…");

      watch.current = navigator.geolocation.watchPosition(
        (position) => {
          const now = Date.now();
          const previous = lastSent.current;
          const moved = previous ? distanceMeters(previous.lat, previous.lon, position.coords.latitude, position.coords.longitude) : Infinity;
          const enoughTime = !previous || now - previous.at >= MIN_SEND_INTERVAL_MS;

          setStatus(`GPS nhận lúc ${new Date(position.timestamp).toLocaleTimeString("vi-VN")} · ±${Math.round(position.coords.accuracy)} m`);

          if (enoughTime || moved >= MIN_MOVE_METERS) {
            lastSent.current = { at: now, lat: position.coords.latitude, lon: position.coords.longitude };
            void appData.publishLocation(id, position, approximate);
          }
        },
        (error) => setStatus(error.code === 1 ? "Bạn đã từ chối quyền vị trí." : `Không thể lấy vị trí: ${error.message}`),
        { enableHighAccuracy: !approximate, maximumAge: 15_000, timeout: 20_000 },
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Không thể bắt đầu chia sẻ.");
    }
  }

  async function stop() {
    if (!session) return;
    if (watch.current !== null) {
      navigator.geolocation.clearWatch(watch.current);
      watch.current = null;
    }
    await appData.stopLocation(session);
    setSession(null);
    lastSent.current = null;
    setStatus("Đã dừng chia sẻ. Vị trí lưu gần nhất cũng đã bị xóa.");
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Tắt mặc định · có thời hạn · thu hồi ngay</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Chia sẻ vị trí</h1>
      </header>

      <div className="flex gap-3 rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]">
        <ShieldCheck className="mt-0.5 shrink-0" size={20} />
        <p>Chỉ người bạn chọn mới xem được phiên. Server chỉ giữ vị trí mới nhất; dừng phiên sẽ xóa vị trí đó.</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="space-y-5">
          <Card title={session ? "Bạn đang chia sẻ" : "Bắt đầu phiên"}>
            {session ? (
              <>
                <p className="rounded-xl bg-[var(--soft)] p-4 text-sm">{status}</p>
                <Button variant="danger" className="mt-4 w-full" onClick={() => void stop()}><MapPinOff size={18} /> Dừng ngay</Button>
              </>
            ) : (
              <form onSubmit={start} className="space-y-3">
                <input className="field w-full" required value={names} onChange={(e) => setNames(e.target.value)} placeholder="username người nhận, cách nhau dấu phẩy" />
                <select className="field w-full" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                  <option value={30}>30 phút</option>
                  <option value={60}>1 giờ</option>
                  <option value={180}>3 giờ</option>
                  <option value={480}>8 giờ</option>
                </select>
                <label className="flex items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm font-semibold">
                  <input type="checkbox" checked={approximate} onChange={(e) => setApproximate(e.target.checked)} />
                  Chỉ chia sẻ vị trí gần đúng (~100 m)
                </label>
                <Button className="w-full" type="submit"><LocateFixed size={18} /> Bắt đầu chia sẻ</Button>
              </form>
            )}
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Trình duyệt/OS có thể ngừng cập nhật khi app ở nền hoặc bị đóng. Theo dõi nền đáng tin cậy cần ứng dụng native.</p>
          </Card>

          <Card title="Bạn đang được xem">
            <div className="space-y-2">
              {visible.length === 0 && <p className="text-sm text-[var(--muted)]">Không có phiên vị trí nào đang chia sẻ cho bạn.</p>}
              {visible.map((item) => (
                <div key={item.sessionId} className="rounded-2xl bg-[var(--soft)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <b>{item.ownerDisplayName}</b>
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${isStale(item) ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"}`}>
                      {item.recordedAt ? (isStale(item) ? "Vị trí cũ" : "Mới cập nhật") : "Chưa có GPS"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {item.recordedAt ? `${new Date(item.recordedAt).toLocaleTimeString("vi-VN")} · ±${Math.round(item.accuracyM ?? 0)} m` : "Đang chờ vị trí đầu tiên"}
                    {item.approximate ? " · gần đúng" : ""}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden p-2">
          <div ref={mapContainer} className="h-[560px] w-full rounded-[22px]" aria-label="Bản đồ vị trí được chia sẻ" />
        </Card>
      </div>
    </div>
  );
}

function isStale(item: VisibleLocation) {
  return !item.recordedAt || Date.now() - new Date(item.recordedAt).getTime() > STALE_AFTER_MS;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6_371_000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
