import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, HelpCircle, LocateFixed, MapPinOff, MessageCircle, Search, Share2, ShieldCheck } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { missedEventMs } from "../../../kernel/realtime";
import { useModule } from "../../../kernel/session";
import { matchesSearch } from "../../../kernel/text";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { ShareToChatButton } from "../../chat";
import { PeoplePicker, useAcceptedFriends } from "../../friends";
import { ProposeMeetupDialog } from "../../meetups";
import { useFriendModes } from "../../presence";
import { defaultNearbyPreference, distanceTo, freshness, isPermanentLocation, type LocationNearbyPreference, type VisibleLocation } from "../domain/Location";
import { locationModule } from "../location.module";
import { MapCanvas, MapLegend, type OpenCard } from "./MapCanvas";
import { MapSheet, type SheetHeight } from "./MapSheet";
import { useMyPosition } from "./useMyPosition";
import { locale, t } from "../../../kernel/i18n";

const locationKey = ["location"] as const;
const nobody: VisibleLocation[] = [];

function ago(recordedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(recordedAt)) / 1000));
  if (seconds < 20) return t("vừa xong");
  if (seconds < 60) return t("{0} giây trước", seconds);
  if (seconds < 3600) return t("{0} phút trước", Math.floor(seconds / 60));
  return new Date(recordedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** "350 m", "1,2 km", "12 km". */
function distanceText(meters: number) {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: meters < 10_000 ? 1 : 0 })} km`;
}

export function LocationPage() {
  const { locations, visible: loadVisible, sharing } = useModule(locationModule);
  const state = useSyncExternalStore(sharing.subscribe, sharing.getState);
  const friends = useAcceptedFriends();
  const modes = useFriendModes();
  // The realtime "location" event reloads this at once, including each new position. The timer only
  // covers a missed event; with nobody on the map there is nothing to keep fresh, and it slows down.
  const visible = useQuery({ queryKey: [...locationKey, "visible"], queryFn: loadVisible, staleTime: 120_000, refetchInterval: query => query.state.data?.length ? 120_000 : missedEventMs });
  const nearbyPreference = useQuery({ queryKey: [...locationKey, "nearby"], queryFn: () => locations.nearbyPreference(), staleTime: 60_000 });
  const asking = useAction(locationKey);
  const savingNearby = useAction([...locationKey, "nearby"]);
  const mine = useMyPosition();
  const [recipients, setRecipients] = useState<string[]>([]);
  const [durationHours, setDurationHours] = useState(1);
  const [permanent, setPermanent] = useState(true);
  const [approximate, setApproximate] = useState(false);
  const [nearbyDraft, setNearbyDraft] = useState<LocationNearbyPreference>(defaultNearbyPreference);
  const [nearbySaved, setNearbySaved] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [askId, setAskId] = useState("");
  const [asked, setAsked] = useState("");
  const [focus, setFocus] = useState<{ id: string; sequence: number } | undefined>();
  const [search, setSearch] = useState("");
  // Below the wide layout the list and the form are a sheet over the map, folded to its head until asked for.
  const [sheet, setSheet] = useState<SheetHeight>("peek");
  const [card, setCard] = useState<OpenCard | null>(null);
  const [meetupFor, setMeetupFor] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => { if (nearbyPreference.data) setNearbyDraft(nearbyPreference.data); }, [nearbyPreference.data]);

  // Redraw the "x giây trước" labels and the grey state while nothing else changes.
  useEffect(() => {
    const timer = window.setInterval(() => setTick(value => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  // The browser stops GPS when the screen turns off, so the sharer can ask to keep it on.
  useEffect(() => {
    if (!keepAwake || !state.sessions.length || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let active = true;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.wakeLock.request("screen").then(sentinel => { if (active) lock = sentinel; else void sentinel.release(); }).catch(() => undefined);
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => { active = false; document.removeEventListener("visibilitychange", acquire); void lock?.release(); };
  }, [keepAwake, state.sessions.length]);

  // A map that cannot be drawn leaves the list as the way to see the people.
  useEffect(() => { if (mapFailed) setSheet("full"); }, [mapFailed]);
  // Why the dot did not appear is written in the sheet, so the sheet opens.
  useEffect(() => { if (mine.status === "denied" || mine.status === "unavailable") setSheet(height => height === "peek" ? "half" : height); }, [mine.status]);

  function start(event: FormEvent) {
    event.preventDefault();
    void sharing.start(permanent ? null : durationHours * 60, recipients, approximate);
  }
  function saveNearby() {
    savingNearby.run(() => locations.saveNearbyPreference(nearbyDraft), () => {
      setNearbySaved(true);
      void nearbyPreference.refetch();
    });
  }
  const show = (id: string) => {
    setFocus(previous => ({ id, sequence: (previous?.sequence ?? 0) + 1 }));
    // The person is on the map, so the map gets the screen back.
    setSheet("peek");
    document.getElementById("location-map")?.scrollIntoView({ block: "nearest" });
  };
  const { locate } = mine;
  const locateMe = useCallback(() => {
    locate();
    setFocus(previous => ({ id: "me", sequence: (previous?.sequence ?? 0) + 1 }));
  }, [locate]);
  function toSharing() {
    setSheet("full");
    // The form is drawn once the sheet is up.
    requestAnimationFrame(() => {
      const form = document.getElementById("location-sharing");
      form?.scrollIntoView({ block: "start" });
      form?.focus({ preventScroll: true });
    });
  }

  const items = visible.data ?? nobody;
  const now = Date.now();
  const fresh = items.map(item => freshness(item, now));
  // The map gets new points only when a person or a position changes, or a position turns old. The
  // ten-second tick above redraws the labels of this page and leaves the map alone.
  const freshKey = fresh.join();
  const faces = useMemo(() => new Map(friends.map(friend => [friend.userId, friend.avatarUrl ?? null])), [friends]);
  const points = useMemo(() => items.flatMap((item, index) => item.latitude == null || item.longitude == null ? [] : [{
    id: item.sessionId, name: item.ownerDisplayName, latitude: item.latitude, longitude: item.longitude,
    stale: fresh[index] !== "live", approximate: item.approximate, avatarUrl: faces.get(item.ownerId), ring: modes.get(item.ownerId)?.color,
  }]), [items, freshKey, faces, modes]);
  const shown = search.trim() ? items.filter(item => matchesSearch(`${item.ownerDisplayName} ${item.ownerUsername ?? ""}`, search.trim())) : items;
  const opened = card && items.find(item => item.sessionId === card.id);
  const farFrom = (item: VisibleLocation) => {
    const far = mine.position ? distanceTo(item, mine.position) : null;
    return far && (far.rough ? t("Cách bạn khoảng {0} theo đường thẳng", distanceText(far.meters)) : t("Cách bạn {0} theo đường thẳng", distanceText(far.meters)));
  };

  return <div className="space-y-3 xl:space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-black tracking-[-.045em] sm:text-4xl">{t("Bản đồ bạn bè")}</h1>
        <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-[var(--muted)] xl:block">{t("Thấy những người bạn đang chia sẻ vị trí với bạn. Vị trí chỉ được cập nhật khi người chia sẻ đang mở ứng dụng.")}</p>
      </div>
      {!state.sessions.length && <Button variant="secondary" className="xl:hidden" onClick={toSharing}><Share2 size={17} /> {t("Chia sẻ vị trí")}</Button>}
    </header>
    {/* Below the wide layout the map runs from here to the bar at the foot of the screen, and the rest is a sheet over it. Wide, the two stand side by side. */}
    <div className="relative -mb-6 map-phone-frame lg:mb-0 lg:h-[calc(100svh-12rem)] lg:min-h-[26rem] xl:grid xl:h-auto xl:min-h-0 xl:grid-cols-[1.6fr_1fr] xl:items-start xl:gap-4">
      <MapCanvas fill ownerKey="friends" points={points} focusRequest={focus} me={mine.position} onLocate={locateMe} onFailed={setMapFailed} onCard={setCard} />
      <MapSheet height={sheet} onHeight={setSheet} head={<div className="flex min-h-[3.75rem] items-center gap-3 px-4 pb-2">
        <p className="min-w-0 flex-1 truncate text-sm font-bold">{items.length ? t("{0} người đang chia sẻ", items.length) : t("Bạn bè và chia sẻ vị trí")}</p>
        <span className="flex shrink-0 items-center -space-x-2">{items.slice(0, 5).map(item => <button key={item.sessionId} type="button" disabled={item.latitude == null || item.longitude == null} onClick={() => show(item.sessionId)}
          aria-label={t("Xem {0} trên bản đồ", item.ownerDisplayName)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-50">
          <Avatar name={item.ownerDisplayName} src={faces.get(item.ownerId)} className="size-10 border-2 border-[var(--paper)] bg-[var(--ink)] text-sm font-black text-[var(--paper)]" />
        </button>)}</span>
        {items.length > 5 && <span className="shrink-0 text-xs font-bold text-[var(--muted)]">+{items.length - 5}</span>}
      </div>}>
        {mine.status === "asking" && <p role="status" className="px-1 text-sm text-[var(--muted)]">{t("Đang chờ vị trí của bạn. Nếu trình duyệt hỏi, hãy cho phép.")}</p>}
        {mine.status === "on" && mine.position && <p role="status" className="px-1 text-sm text-[var(--muted)]">{state.sessions.length
          ? t("Chấm xanh là bạn (±{0} m). Bạn bè thấy vị trí của bạn qua phiên chia sẻ đang mở, không phải qua chấm này.", Math.round(mine.position.accuracyM))
          : t("Chấm xanh là bạn (±{0} m). Vị trí này chỉ ở trên máy của bạn và không được gửi cho ai.", Math.round(mine.position.accuracyM))}</p>}
        {mine.status === "denied" && <p role="alert" className="px-1 text-sm text-[var(--danger)]">{t("Trình duyệt đang chặn định vị với trang này. Hãy cho phép “Vị trí” trong cài đặt trang của trình duyệt, rồi bấm lại “Vị trí của tôi”.")}</p>}
        {mine.status === "unavailable" && <p role="alert" className="px-1 text-sm text-[var(--danger)]">{t("Chưa đọc được vị trí của bạn. Hãy bật định vị của máy, hoặc thử lại ở nơi thoáng hơn.")}</p>}

        <Card title={items.length ? t("Bạn bè đang chia sẻ · {0}", items.length) : t("Bạn bè đang chia sẻ")}>
          {visible.isPending && <p role="status">{t("Đang tải người chia sẻ…")}</p>}
          {visible.isError && <div role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(visible.error, t("Không tải được người chia sẻ."))} <Button variant="ghost" onClick={() => void visible.refetch()}>{t("Thử tải lại")}</Button></div>}
          {visible.isSuccess && !items.length && <p className="text-sm text-[var(--muted)]">{t("Chưa có ai chia sẻ với bạn.")}</p>}
          <div id="location-friends">
            {items.length > 5 && <label className="relative mb-3 block">
              <span className="sr-only">{t("Tìm bạn trên bản đồ")}</span>
              <Search size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input type="search" className="field w-full pl-9" placeholder={t("Tìm bạn trên bản đồ")} value={search} onChange={event => setSearch(event.target.value)} />
            </label>}
            {points.length > 0 && !mine.position && <p className="mb-3 text-xs leading-5 text-[var(--muted)]">{t("Bấm “Vị trí của tôi” trên bản đồ để biết bạn cách mỗi người bao xa. Vị trí của bạn không được gửi đi.")}</p>}
            {search.trim() && !shown.length && <p className="mb-3 text-sm text-[var(--muted)]">{t("Không ai đang chia sẻ có tên như vậy.")}</p>}
            <ul className="space-y-2">{shown.map(item => {
              const status = freshness(item, now);
              const far = farFrom(item);
              return <li key={item.sessionId}>
                <button type="button" disabled={item.latitude == null || item.longitude == null} onClick={() => show(item.sessionId)}
                  className="block w-full rounded-2xl bg-[var(--soft)] p-3 text-left transition hover:bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:cursor-default">
                  <span className="flex items-start justify-between gap-2"><b className="min-w-0 break-words">{item.ownerDisplayName}</b>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${status === "live" ? "bg-[var(--lime)] text-[var(--ink)]" : "bg-[color-mix(in_srgb,var(--ink)_9%,transparent)] text-[var(--muted)]"}`}>{status === "none" ? t("Chưa có vị trí") : status === "stale" ? t("Tạm dừng") : t("Đang cập nhật")}</span></span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{item.recordedAt ? `${ago(item.recordedAt)} · ±${Math.round(item.accuracyM ?? 0)} m` : t("Chờ vị trí đầu tiên")}{item.approximate ? t(" · gần đúng") : ""}{item.expiresAt === "infinity" ? t(" · chia sẻ liên tục") : t(" · hết hạn lúc {0}", new Date(item.expiresAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }))}</span>
                  {far && <span className="mt-0.5 block text-sm font-semibold">{far}
                    {status === "stale" && <span className="font-normal text-[var(--muted)]">{t(" · tính từ vị trí cũ")}</span>}</span>}
                </button>
              </li>;
            })}</ul>

            <form className="mt-4 flex flex-wrap items-end gap-2 border-t border-black/8 pt-4 dark:border-white/8" onSubmit={event => {
              event.preventDefault();
              setAsked("");
              if (askId) asking.run(() => locations.ask(askId), () => setAsked(t("Đã gửi lời hỏi. Bạn ấy sẽ nhận được thông báo.")));
            }}>
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">{t("Hỏi vị trí một người bạn")}
                <select className="field" value={askId} onChange={event => setAskId(event.target.value)} required>
                  <option value="">{t("Chọn bạn")}</option>
                  {friends.map(friend => <option key={friend.userId} value={friend.userId}>{friend.displayName}</option>)}
                </select>
              </label>
              <Button type="submit" variant="ghost" disabled={asking.pending || !askId}><HelpCircle size={17} /> {t("Hỏi")}</Button>
            </form>
            {asked && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{asked}</p>}
            {asking.error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{asking.error}</p>}
          </div>
        </Card>

        <div id="location-sharing" tabIndex={-1} className="scroll-mt-4 rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          <Card title={state.sessions.length ? t("Phiên chia sẻ của bạn") : t("Chia sẻ vị trí của bạn")}>
            {state.loading && <p role="status">{t("Đang kiểm tra phiên đang mở…")}</p>}
            {state.error && <div role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(new Error(state.error), state.error)} <Button variant="ghost" disabled={state.pending} onClick={() => void sharing.refresh()}>{t("Thử tải lại phiên")}</Button></div>}
            <p role="status" className="mb-3 text-sm">{state.status}</p>
            {state.sessions.length ? <>
              {state.sessions.map(session => <div key={session.id} className="mb-3 rounded-xl bg-[var(--soft)] p-3">
                <p className="text-sm">{isPermanentLocation(session) ? t("Đang chia sẻ liên tục, cho tới khi bạn tắt.{0}", session.approximate ? t(" · gần đúng") : "") : t("Hết hạn: {0}{1}", new Date(session.expires_at).toLocaleString(locale), session.approximate ? t(" · gần đúng") : "")}</p>
                <Button variant="danger" disabled={state.pending} className="mt-3 w-full" onClick={() => void sharing.stop(session.id)}><MapPinOff size={18} /> {t("Dừng phiên này")}</Button>
              </div>)}
              {/* A card in a chat that opens the map. Only the friends this share is for see the position there. */}
              <ShareToChatButton path="/me/location" title={t("Vị trí của tôi trên bản đồ")} className="mb-2 w-full" />
              {"wakeLock" in navigator && <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={keepAwake} onChange={event => setKeepAwake(event.target.checked)} /> {t("Giữ màn hình sáng khi đang chia sẻ")}</label>}
            </> : <form onSubmit={start} className="space-y-3">
              <p className="flex gap-2 text-sm leading-6 text-[var(--muted)]"><ShieldCheck className="mt-0.5 shrink-0" size={18} /> {t("Chỉ những người bạn mà bạn chọn mới xem được. Máy chủ chỉ giữ vị trí mới nhất, và xóa nó khi bạn dừng.")}</p>
              <div className="flex justify-end"><Button type="button" variant="ghost" disabled={!friends.length} onClick={() => setRecipients(friends.every(friend => recipients.includes(friend.userId)) ? [] : friends.map(friend => friend.userId))}>{friends.length && friends.every(friend => recipients.includes(friend.userId)) ? t("Bỏ chọn tất cả bạn bè") : t("Chọn tất cả bạn bè")}</Button></div>
              <PeoplePicker legend={t("Chia sẻ với")} value={recipients} onChange={setRecipients} />
              <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={permanent} onChange={event => setPermanent(event.target.checked)} /> {t("Chia sẻ liên tục cho tới khi tôi tắt")}</label>
              {!permanent && <label className="block text-sm font-semibold">{t("Chia sẻ trong bao nhiêu giờ?")}<span className="mt-1 flex items-center gap-2"><input className="field w-28" type="number" min={1} max={720} step={1} required value={durationHours} onChange={event => setDurationHours(Number(event.target.value))} /><span className="font-normal text-[var(--muted)]">{t("giờ · từ 1 đến 720")}</span></span></label>}
              <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={approximate} onChange={event => setApproximate(event.target.checked)} /> {t("Chỉ chia sẻ vị trí gần đúng (khoảng 100 m)")}</label>
              <Button className="w-full" type="submit" disabled={state.pending || state.loading || !recipients.length || (!permanent && (durationHours < 1 || durationHours > 720))}><LocateFixed size={18} /> {t("Bắt đầu chia sẻ")}</Button>
            </form>}
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{t("Vị trí được gửi khi bạn đang mở ứng dụng, kể cả ở màn hình khác. Khi bạn đóng ứng dụng hoặc tắt màn hình, bạn bè thấy trạng thái “Tạm dừng” cùng vị trí cuối cho tới khi phiên hết hạn hoặc bạn dừng. Tải lại trang không tự bật GPS.")}</p>
          </Card>
        </div>
        <Card title={t("Thông báo khi bạn bè ở gần")}>
          <p className="mb-3 text-sm leading-6 text-[var(--muted)]">{t("Cảnh báo tự gửi khi hai bạn đang chia sẻ vị trí cho nhau và cả hai vị trí vừa được cập nhật. Không cần bật tùy chọn cảnh báo. Hệ thống cộng sai số GPS vào khoảng cách để tránh báo nhầm; vị trí gần đúng cũng được xét khi độ chính xác đủ tốt. Mặc định cảnh báo trong 500 m và nhắc lại sau 30 phút. Bạn có thể đổi khoảng cách và chu kỳ bên dưới.")}</p>
          {nearbyPreference.isError && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(nearbyPreference.error, t("Không tải được cài đặt khoảng cách."))}</p>}
          <label className="mt-3 grid gap-1 text-sm font-semibold">{t("Bán kính cảnh báo")}<select className="field" value={nearbyDraft.radiusM} onChange={event => { setNearbySaved(false); setNearbyDraft(value => ({ ...value, radiusM: Number(event.target.value) })); }}>
            {[250, 500, 1000, 2000].map(radius => <option key={radius} value={radius}>{t("Trong vòng {0} m", radius)}</option>)}
          </select></label>
          <label className="mt-3 grid gap-1 text-sm font-semibold">{t("Nhắc lại sau mỗi")}<select className="field" value={nearbyDraft.repeatMinutes} onChange={event => { setNearbySaved(false); setNearbyDraft(value => ({ ...value, repeatMinutes: Number(event.target.value) })); }}>
            {[5, 10, 15, 30, 60].map(minutes => <option key={minutes} value={minutes}>{t("{0} phút", minutes)}</option>)}
          </select></label>
          <Button type="button" className="mt-3 w-full" disabled={nearbyPreference.isPending || savingNearby.pending} onClick={saveNearby}>{savingNearby.pending ? t("Đang lưu…") : t("Lưu khoảng cách và chu kỳ nhắc")}</Button>
          {savingNearby.error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{savingNearby.error}</p>}
          {nearbySaved && <p role="status" className="mt-2 text-sm text-[var(--muted)]">{t("Đã lưu khoảng cách và chu kỳ nhắc. Cảnh báo sẽ được xét ở lần cập nhật vị trí tiếp theo.")}</p>}
        </Card>
        <MapLegend own className="px-1 xl:hidden" />
      </MapSheet>
    </div>

    {/* The card of the person whose face was pressed, drawn into the map's own popup. */}
    {card && opened && createPortal(<div className="grid w-56 max-w-full gap-2 text-left">
      <div className="flex items-center gap-3">
        <Avatar name={opened.ownerDisplayName} src={faces.get(opened.ownerId)} className="size-11 shrink-0 bg-[var(--ink)] font-black text-[var(--paper)]" />
        <div className="min-w-0">
          <b className="block truncate text-base leading-5">{opened.ownerDisplayName}</b>
          {modes.get(opened.ownerId) && <span className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold"><i aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: modes.get(opened.ownerId)!.color }} /> {modes.get(opened.ownerId)!.label}</span>}
        </div>
      </div>
      <p className="text-xs leading-5 text-[var(--muted)]">{freshness(opened, now) === "stale" ? t("Vị trí cũ") : t("Mới cập nhật")}{opened.recordedAt ? ` · ${ago(opened.recordedAt)}` : ""}{opened.approximate ? t(" · gần đúng") : ""}</p>
      {farFrom(opened) && <p className="text-sm font-semibold leading-5">{farFrom(opened)}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Link to={`/chat/with/${opened.ownerId}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--lime)] px-3 text-sm font-semibold text-[var(--ink)]"><MessageCircle size={16} /> {t("Nhắn tin")}</Link>
        <button type="button" onClick={() => setMeetupFor(opened.ownerId)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold"><CalendarPlus size={16} /> {t("Rủ gặp")}</button>
      </div>
    </div>, card.element)}
    <ProposeMeetupDialog key={meetupFor ?? "map-meetup"} open={!!meetupFor} onOpenChange={open => { if (!open) setMeetupFor(null); }}
      start={Date.now() + 60 * 60_000} end={Date.now() + 2 * 60 * 60_000} inviteeIds={meetupFor ? [meetupFor] : []} />
  </div>;
}
