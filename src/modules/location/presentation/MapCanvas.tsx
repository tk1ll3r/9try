import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { LocateFixed, RotateCcw, Users } from "lucide-react";
import { Map, Marker, Popup, NavigationControl, LngLatBounds } from "./maplibre";
import { theme } from "../../../kernel/theme";
import { Button } from "../../../kernel/ui/Button";
import { t } from "../../../kernel/i18n";

export interface MapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  stale: boolean;
  approximate: boolean;
  /** The person's picture, as their profile stores it. Without one the marker shows their initial. */
  avatarUrl?: string | null;
  /** The color of what the person is doing now. It turns around their face. */
  ring?: string;
}
/** A person's card on the map: whose it is, and the element to draw it in. */
export interface OpenCard { id: string; element: HTMLElement }
/** Where the viewer is. It is drawn on this device and goes nowhere else. */
export interface OwnPoint {
  latitude: number;
  longitude: number;
  accuracyM: number;
}
interface Props {
  points: MapPoint[];
  ownerKey: string;
  /** Moves the camera to a point, or to the viewer with the id "me". A new sequence asks again. */
  focusRequest?: { id: string; sequence: number };
  me?: OwnPoint;
  /** Adds the "Vị trí của tôi" button. The map only passes the press on. */
  onLocate?: () => void;
  /** Told when the map stops working and when it works again, so the page can show the people another way. */
  onFailed?: (failed: boolean) => void;
  /**
   * Told when a person's card opens, with the element to draw it in, and when it closes. Without it
   * the card says the name and how fresh the position is.
   */
  onCard?: (card: OpenCard | null) => void;
  /** Below the wide layout the map takes the height of what it is put in, a sheet lies over its foot, and the legend is the page's to place. */
  fill?: boolean;
  /** Another style than the app's own two. `VITE_MAP_STYLE_URL` sets it for a whole build. */
  styleUrl?: string;
}
interface Drawn { marker: Marker; popup: Popup; face: HTMLElement; inner: HTMLElement; label: HTMLElement; card: HTMLElement; at: string; look: string; frame: number }

/** Moves a marker to its new place in 600 ms, so the eye can follow who moved. Someone who asked for less motion gets the jump. */
function glide(drawn: Drawn, longitude: number, latitude: number) {
  cancelAnimationFrame(drawn.frame);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { drawn.marker.setLngLat([longitude, latitude]); return; }
  const from = drawn.marker.getLngLat();
  const began = performance.now();
  const step = (now: number) => {
    const share = Math.min(1, Math.max(0, (now - began) / 600));
    const eased = 1 - (1 - share) ** 3;
    drawn.marker.setLngLat([from.lng + (longitude - from.lng) * eased, from.lat + (latitude - from.lat) * eased]);
    if (share < 1) drawn.frame = requestAnimationFrame(step);
  };
  drawn.frame = requestAnimationFrame(step);
}

/** What the marks on the map mean. The map shows it under itself; a page that lays a sheet over the map puts it in the sheet. */
export function MapLegend({ own, className = "" }: { own: boolean; className?: string }) {
  const swatch = "inline-block size-3 shrink-0 rounded-full";
  return <ul className={`flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-xs text-[var(--muted)] ${className}`}>
    <li className="flex items-center gap-1.5"><i aria-hidden className={`${swatch} bg-[var(--ink)] ring-2 ring-[var(--lime-strong)]`} /> {t("Đang cập nhật")}</li>
    <li className="flex items-center gap-1.5"><i aria-hidden className={`${swatch} border-2 border-dashed border-current`} /> {t("Gần đúng, trong khoảng 100 m")}</li>
    <li className="flex items-center gap-1.5"><i aria-hidden className={`${swatch} bg-[var(--tone-busy)]`} /> {t("Vị trí cũ, có thể người ấy đã đi")}</li>
    {own && <li className="flex items-center gap-1.5"><i aria-hidden className={`${swatch} bg-[var(--tone-class)] ring-2 ring-[var(--surface)]`} /> {t("Bạn, chỉ hiện trên máy này")}</li>}
  </ul>;
}

const onMap = "inline-flex min-h-11 items-center gap-1.5 rounded-2xl border border-black/10 bg-[var(--surface)] px-2.5 text-sm font-semibold text-[var(--ink)] shadow-md transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50 dark:border-white/10";

/**
 * The map. A page that draws again (a label that counts seconds, a list that reloads) hands over the
 * same points, and then nothing here runs: the markers are kept by id and only what changed about a
 * person is touched. The camera moves when someone asks for it, and once, to show everyone, if they
 * have not moved the map themselves by then.
 */
export const MapCanvas = memo(function MapCanvas({ points, ownerKey, focusRequest, me, onLocate, onFailed, onCard, fill = false, styleUrl }: Props) {
  // The app's own two styles, one for each look: public/map, built by scripts/build-map-style.mjs.
  const look = useSyncExternalStore(theme.subscribe, theme.look);
  const style = styleUrl ?? (import.meta.env.VITE_MAP_STYLE_URL || `/map/${look}.json`);
  const wanted = useRef(style);
  const drawnStyle = useRef(style);
  const tell = useRef(onCard);
  tell.current = onCard;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map | null>(null);
  const markers = useRef<Record<string, Drawn>>({});
  const own = useRef<{ marker: Marker; circle: HTMLElement } | null>(null);
  const autoFocused = useRef(false);
  const answered = useRef<object | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  // The look changed: the same map takes the other style. The markers and the view stay.
  useEffect(() => {
    wanted.current = style;
    if (map.current && drawnStyle.current !== style) { drawnStyle.current = style; map.current.setStyle(style); }
  }, [style]);

  useEffect(() => {
    if (!container.current) return;
    const box = container.current;
    let disposed = false;
    let current: Map | null = null;
    let resize: ResizeObserver | undefined;
    let frame = 0;
    setState("loading"); setError(""); autoFocused.current = false;
    const timeout = window.setTimeout(() => {
      if (!disposed) { setState("error"); setError(t("Bản đồ tải quá lâu. Kiểm tra mạng hoặc thử tải lại; các nút dừng chia sẻ vẫn sử dụng được.")); }
    }, 15_000);
    try {
      drawnStyle.current = wanted.current;
      current = new Map({ container: box, style: wanted.current, center: [106.66, 10.78], zoom: 11 });
      map.current = current;
      current.addControl(new NavigationControl({ showCompass: false }), "top-right");
      // Names stand under the faces once the map is close enough for them not to lie on each other.
      const names = () => box.classList.toggle("map-names", (current?.getZoom() ?? 0) >= 14);
      current.on("zoom", names);
      current.on("load", () => {
        if (!disposed) { window.clearTimeout(timeout); names(); setState("ready"); setError(""); }
      });
      current.on("error", () => {
        if (!disposed) { window.clearTimeout(timeout); setState("error"); setError(t("Không tải được tài nguyên bản đồ. Thử tải lại hoặc kiểm tra kết nối. Danh sách người và quyền chia sẻ không bị thay đổi.")); }
      });
      // A movement by hand means the person chose a view, and it is theirs to keep.
      current.on("movestart", event => {
        if ((event as { originalEvent?: unknown }).originalEvent) autoFocused.current = true;
      });
      current.getCanvas().addEventListener("webglcontextlost", contextLost);
      resize = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => { if (!disposed) current?.resize(); });
      });
      resize.observe(box);
    } catch {
      window.clearTimeout(timeout);
      setState("error"); setError(t("Không khởi tạo được bản đồ. Hãy kiểm tra hỗ trợ WebGL/tăng tốc đồ họa trong trình duyệt. Bạn vẫn có thể dừng chia sẻ ở bảng bên cạnh."));
    }
    function contextLost() {
      if (!disposed) { setState("error"); setError(t("Trình duyệt mất kết nối đồ họa. Hãy tải lại bản đồ.")); }
    }
    return () => {
      disposed = true; window.clearTimeout(timeout); cancelAnimationFrame(frame); resize?.disconnect();
      Object.values(markers.current).forEach(drawn => { cancelAnimationFrame(drawn.frame); drawn.marker.remove(); }); markers.current = {};
      own.current?.marker.remove(); own.current = null;
      current?.getCanvas().removeEventListener("webglcontextlost", contextLost);
      current?.remove(); map.current = null;
    };
  }, [attempt, ownerKey]);

  useEffect(() => onFailed?.(state === "error"), [state, onFailed]);

  const usable = points.filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
    && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);

  // One marker per person, kept for as long as the person is on the map.
  useEffect(() => {
    const live = map.current;
    if (!live || state !== "ready") return;
    const kept = markers.current;
    const present = new Set<string>();
    for (const point of usable) {
      present.add(point.id);
      let drawn = kept[point.id];
      if (!drawn) {
        // MapLibre moves the outer element and owns its classes. The face inside, the name under it and the card are ours.
        const element = document.createElement("div");
        // A press on it, or Enter, opens the person's card.
        element.setAttribute("role", "button");
        const face = element.appendChild(document.createElement("div"));
        const inner = face.appendChild(document.createElement("span"));
        inner.className = "map-face-in";
        const label = element.appendChild(document.createElement("span"));
        label.className = "map-name";
        const card = document.createElement("div");
        const id = point.id;
        const popup = new Popup({ offset: 30, closeButton: false, maxWidth: "18rem" }).setDOMContent(card);
        popup.on("open", () => tell.current?.({ id, element: card }));
        popup.on("close", () => tell.current?.(null));
        drawn = kept[point.id] = { marker: new Marker({ element }), popup, face, inner, label, card, at: "", look: "", frame: 0 };
      }
      const at = `${point.longitude},${point.latitude}`;
      if (drawn.at !== at) {
        if (drawn.at) glide(drawn, point.longitude, point.latitude);
        // The card is attached once the marker is on the map: putting a marker on a map takes MapLibre's key listener for the card off it.
        else drawn.marker.setLngLat([point.longitude, point.latitude]).addTo(live).setPopup(drawn.popup);
        drawn.at = at;
      }
      const look = `${point.name}|${point.stale}|${point.approximate}|${point.ring ?? ""}|${point.avatarUrl ?? ""}`;
      if (drawn.look !== look) {
        drawn.look = look;
        // Breathing while the position is fresh, grey once it is old, and a dashed rim around a
        // position that was rounded before it was sent.
        drawn.face.className = `map-face ${point.stale ? "marker-old" : "marker-live"} ${point.approximate ? "marker-rough" : ""}`;
        drawn.face.toggleAttribute("data-mode", !!point.ring);
        if (point.ring) drawn.face.style.setProperty("--mode", point.ring); else drawn.face.style.removeProperty("--mode");
        // Only a picture stored inside the profile is drawn, as everywhere else in the app.
        if (point.avatarUrl?.startsWith("data:image/")) {
          const picture = document.createElement("img");
          picture.src = point.avatarUrl; picture.alt = "";
          drawn.inner.replaceChildren(picture);
        } else drawn.inner.textContent = point.name.slice(0, 1).toUpperCase();
        drawn.label.textContent = point.name;
        drawn.marker.getElement().setAttribute("aria-label", t("Vị trí {0}", point.name));
        if (!tell.current) drawn.card.textContent = `${point.name} · ${point.stale ? t("Vị trí cũ") : t("Mới cập nhật")}${point.approximate ? t(" · gần đúng") : ""}`;
      }
    }
    for (const id of Object.keys(kept)) if (!present.has(id)) { cancelAnimationFrame(kept[id].frame); kept[id].marker.remove(); delete kept[id]; }
    if (usable.length && !autoFocused.current) { autoFocused.current = true; showAll(); }
  }, [points, state]);

  // The viewer: a dot, and around it the circle the true position is somewhere inside.
  useEffect(() => {
    const live = map.current;
    if (!live || state !== "ready" || !me) { own.current?.marker.remove(); own.current = null; return; }
    if (!own.current) {
      const element = document.createElement("div");
      element.setAttribute("aria-label", t("Vị trí của bạn"));
      element.dataset.testid = "my-position";
      const circle = element.appendChild(document.createElement("div"));
      circle.className = "map-me-around";
      element.appendChild(document.createElement("div")).className = "map-me";
      own.current = { marker: new Marker({ element }).setLngLat([me.longitude, me.latitude]).addTo(live), circle };
    }
    const { marker, circle } = own.current;
    marker.setLngLat([me.longitude, me.latitude]);
    // Metres to pixels at this latitude and zoom. MapLibre's world is 512 px wide at zoom 0.
    const size = () => {
      const metersPerPixel = 40_075_016.686 * Math.cos(me.latitude * Math.PI / 180) / (512 * 2 ** live.getZoom());
      const diameter = Math.round(2 * me.accuracyM / metersPerPixel);
      circle.style.width = circle.style.height = `${diameter}px`;
      circle.hidden = diameter < 20;
    };
    size();
    live.on("zoom", size);
    return () => { live.off("zoom", size); };
  }, [me, state]);

  useEffect(() => {
    if (!map.current || state !== "ready" || !focusRequest || answered.current === focusRequest) return;
    const target = focusRequest.id === "me" ? me : usable.find(point => point.id === focusRequest.id);
    // "Me" waits for the first position: the person was asked for permission a moment ago.
    if (!target && focusRequest.id === "me") return;
    answered.current = focusRequest;
    if (target) map.current.flyTo({ center: [target.longitude, target.latitude], zoom: Math.max(map.current.getZoom(), 15), essential: false });
  }, [focusRequest, state, me, points]);

  const everyone = me ? [...usable, me] : usable;
  function showAll() {
    if (!map.current || !everyone.length) return;
    if (everyone.length === 1) map.current.flyTo({ center: [everyone[0].longitude, everyone[0].latitude], zoom: 14, essential: false });
    else {
      const bounds = new LngLatBounds();
      everyone.forEach(point => bounds.extend([point.longitude, point.latitude]));
      // More room at the top, where the buttons are, and at the foot where a sheet lies over the map: nobody is shown underneath them.
      const sheet = fill && !window.matchMedia("(min-width: 1280px)").matches ? 88 : 0;
      map.current.fitBounds(bounds, { padding: { top: 120, bottom: 56 + sheet, left: 48, right: 48 }, maxZoom: 15, duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600 });
    }
  }
  return <section id="location-map" aria-label={t("Bản đồ vị trí")} className={`map-skin scroll-mt-4 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm ${fill ? "map-under-sheet flex h-full flex-col xl:block xl:h-auto" : ""}`}>
    <div className={`relative ${fill ? "flex min-h-0 flex-1 flex-col xl:block" : ""}`}>
      <div ref={container} className={`w-full ${fill ? "min-h-0 flex-1 xl:h-[min(70vh,720px)] xl:flex-none" : "h-[58svh] min-h-[320px] sm:h-[520px] xl:h-[min(70vh,720px)]"}`} aria-label={t("Khung bản đồ")} data-testid="map-container" data-map-state={state} data-map-look={styleUrl ? undefined : look} />
      {/* Top left: the zoom buttons have the top right, and the bottom belongs to the map's credits. Only the buttons and the message take presses; the map is dragged through the rest. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col items-start gap-2 pr-14 *:pointer-events-auto">
        <div className="flex flex-wrap gap-2">
          {onLocate && <button type="button" className={onMap} onClick={onLocate}><LocateFixed size={17} className="text-[var(--tone-class)]" /> {t("Vị trí của tôi")}</button>}
          <button type="button" className={onMap} disabled={!everyone.length || state !== "ready"} onClick={showAll}><Users size={17} /> {t("Xem tất cả")}</button>
        </div>
        {state === "loading" && <p role="status" className="rounded-xl bg-[var(--surface)] px-4 py-2 text-sm shadow">{t("Đang tải bản đồ…")}</p>}
        {state === "error" && <div role="alert" className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg">
          <p className="text-sm">{error}</p><Button className="mt-3" variant="secondary" onClick={() => setAttempt(value => value + 1)}><RotateCcw size={16} /> {t("Tải lại bản đồ")}</Button>
        </div>}
      </div>
    </div>
    <MapLegend own={!!onLocate} className={fill ? "hidden xl:flex" : ""} />
  </section>;
});
