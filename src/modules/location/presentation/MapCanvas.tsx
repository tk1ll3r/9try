import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, MapPin, RotateCcw } from "lucide-react";
import { Map, Marker, Popup, NavigationControl, LngLatBounds } from "./maplibre";
import { Button } from "../../../shared/ui/Button";

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stale: boolean;
  approximate: boolean;
}
interface Props { points: MapPoint[]; ownerKey: string; focusRequest?: { id: string; sequence: number }; styleUrl?: string }

export function MapCanvas({ points, ownerKey, focusRequest, styleUrl = import.meta.env.VITE_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/liberty" }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markers = useRef<Marker[]>([]);
  const autoFocused = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let current: Map | null = null;
    let resize: ResizeObserver | undefined;
    let frame = 0;
    setState("loading"); setError(""); autoFocused.current = false;
    const timeout = window.setTimeout(() => {
      if (!disposed) { setState("error"); setError("Bản đồ tải quá lâu. Kiểm tra mạng hoặc thử tải lại; các nút dừng chia sẻ vẫn sử dụng được."); }
    }, 15_000);
    try {
      current = new Map({ container: container.current, style: styleUrl, center: [106.66, 10.78], zoom: 11 });
      map.current = current;
      current.addControl(new NavigationControl({ showCompass: false }), "top-right");
      current.on("load", () => {
        if (!disposed) { window.clearTimeout(timeout); setState("ready"); setError(""); }
      });
      current.on("error", () => {
        if (!disposed) { window.clearTimeout(timeout); setState("error"); setError("Không tải được tài nguyên bản đồ. Thử tải lại hoặc kiểm tra kết nối. Danh sách người và quyền chia sẻ không bị thay đổi."); }
      });
      current.getCanvas().addEventListener("webglcontextlost", contextLost);
      resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { if (!disposed) current?.resize(); });
      });
      resize.observe(container.current);
    } catch {
      window.clearTimeout(timeout);
      setState("error"); setError("Không khởi tạo được bản đồ. Hãy kiểm tra hỗ trợ WebGL/tăng tốc đồ họa trong trình duyệt. Bạn vẫn có thể dừng chia sẻ ở bảng bên cạnh.");
    }
    function contextLost() {
      if (!disposed) { setState("error"); setError("Trình duyệt mất kết nối đồ họa. Hãy tải lại bản đồ."); }
    }
    return () => {
      disposed = true; window.clearTimeout(timeout); cancelAnimationFrame(frame); resize?.disconnect();
      markers.current.forEach(marker => marker.remove()); markers.current = [];
      current?.getCanvas().removeEventListener("webglcontextlost", contextLost);
      current?.remove(); map.current = null;
    };
  }, [attempt, ownerKey, styleUrl]);

  const usable = points.filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  useEffect(() => {
    markers.current.forEach(marker => marker.remove()); markers.current = [];
    if (!map.current || state !== "ready") return;
    for (const point of usable) {
      const popup = new Popup({ offset: 20 }).setText(`${point.name} · ${point.stale ? "Vị trí cũ" : "Mới cập nhật"}${point.approximate ? " · gần đúng" : ""}`);
      // A round badge with the person's initial; grey once the position is old.
      const element = document.createElement("div");
      element.textContent = point.name.slice(0, 1).toUpperCase();
      element.className = `grid size-9 place-items-center rounded-full border-2 border-white font-bold text-white shadow-lg ${point.stale ? "bg-gray-500" : "bg-[#171a12]"}`;
      const marker = new Marker({ element })
        .setLngLat([point.longitude, point.latitude]).setPopup(popup).addTo(map.current);
      marker.getElement().setAttribute("aria-label", `Vị trí ${point.name}`);
      markers.current.push(marker);
    }
    if (usable.length && !autoFocused.current) { autoFocused.current = true; showAll(); }
  }, [points, state, attempt, ownerKey]);

  useEffect(() => {
    const point = usable.find(point => point.id === focusRequest?.id);
    if (map.current && state === "ready" && point) map.current.flyTo({ center: [point.longitude, point.latitude], zoom: 15, essential: false });
  }, [focusRequest, state]);

  function showAll() {
    if (!map.current || !usable.length) return;
    if (usable.length === 1) map.current.flyTo({ center: [usable[0].longitude, usable[0].latitude], zoom: 14, essential: false });
    else {
      const bounds = new LngLatBounds();
      usable.forEach(point => bounds.extend([point.longitude, point.latitude]));
      map.current.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    }
  }
  return <section aria-label="Bản đồ vị trí" className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <div className="flex items-center gap-2 font-semibold"><MapPin size={18} /> Bản đồ <span className="text-sm font-normal text-[var(--muted)]">· {usable.length} vị trí</span></div>
      <Button variant="ghost" disabled={!usable.length || state !== "ready"} onClick={showAll}><LocateFixed size={17} /> Xem tất cả</Button>
    </div>
    <div className="relative">
      <div ref={container} className="h-[360px] w-full sm:h-[520px]" aria-label="Khung bản đồ" data-testid="map-container" data-map-state={state} />
      {state === "loading" && <p role="status" className="absolute left-3 top-3 rounded-xl bg-[var(--surface)] px-4 py-2 text-sm shadow">Đang tải bản đồ…</p>}
      {state === "error" && <div role="alert" className="absolute inset-x-3 top-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
        <p className="text-sm">{error}</p><Button className="mt-3" variant="secondary" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} /> Tải lại bản đồ</Button>
      </div>}
    </div>
    <p className="px-4 py-3 text-xs leading-5 text-[var(--muted)]">Bản đồ và định vị là hai phần riêng. Không có người chia sẻ vẫn xem được bản đồ. Vị trí cũ không chứng minh người đó còn ở đây.</p>
  </section>;
}
