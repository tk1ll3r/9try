import { useQuery } from "@tanstack/react-query";
import { HelpCircle, LocateFixed, MapPinOff, ShieldCheck, Users } from "lucide-react";
import { type FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { PeoplePicker, useAcceptedFriends } from "../../friends";
import type { VisibleLocation } from "../domain/Location";
import { locationModule } from "../location.module";
import { MapCanvas } from "./MapCanvas";
import { locale, t } from "../../../kernel/i18n";

const locationKey = ["location"] as const;

/** A position older than this is drawn grey: the person may have closed the app. */
const staleAfterMs = 60_000;
const isStale = (item: VisibleLocation) => !item.recordedAt || Date.now() - Date.parse(item.recordedAt) > staleAfterMs;

function ago(recordedAt: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(recordedAt)) / 1000));
  if (seconds < 20) return t("vừa xong");
  if (seconds < 60) return t("{0} giây trước", seconds);
  if (seconds < 3600) return t("{0} phút trước", Math.floor(seconds / 60));
  return new Date(recordedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function LocationPage() {
  const { locations, sharing } = useModule(locationModule);
  const state = useSyncExternalStore(sharing.subscribe, sharing.getState);
  const friends = useAcceptedFriends();
  // ponytail: the realtime "location" event reloads this at once; the timer covers a missed event.
  const visible = useQuery({ queryKey: [...locationKey, "visible"], queryFn: () => locations.listVisible(), refetchInterval: 15_000 });
  const asking = useAction(locationKey);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [duration, setDuration] = useState(60);
  const [approximate, setApproximate] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [askId, setAskId] = useState("");
  const [asked, setAsked] = useState("");
  const [focus, setFocus] = useState<{ id: string; sequence: number } | undefined>();
  const [, setTick] = useState(0);

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

  function start(event: FormEvent) {
    event.preventDefault();
    void sharing.start(duration, recipients, approximate);
  }

  const items = visible.data ?? [];
  const points = items.filter(item => item.latitude != null && item.longitude != null).map(item => ({
    id: item.sessionId, name: item.ownerDisplayName, latitude: item.latitude!, longitude: item.longitude!,
    stale: isStale(item), approximate: item.approximate,
  }));

  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{t("Tắt mặc định · có thời hạn · chủ động thu hồi")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Bản đồ bạn bè")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Thấy những người bạn đang chia sẻ vị trí với bạn. Vị trí chỉ được cập nhật khi người chia sẻ đang mở ứng dụng.")}</p>
    </header>
    <div className="flex gap-3 rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]"><ShieldCheck className="mt-0.5 shrink-0" size={20} />
      <p>{t("Chỉ những người bạn mà bạn chọn mới xem được. Máy chủ chỉ giữ vị trí mới nhất, và xóa nó khi bạn dừng.")}</p></div>
    <div className="grid items-start gap-5 xl:grid-cols-[1.5fr_1fr]">
      <MapCanvas ownerKey="friends" points={points} focusRequest={focus} />
      <div className="space-y-5">
        <Card title={t("Bạn bè đang chia sẻ")} action={<Users size={18} />}>
          {visible.isPending && <p role="status">{t("Đang tải người chia sẻ…")}</p>}
          {visible.isError && <div role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(visible.error, t("Không tải được người chia sẻ."))} <Button variant="ghost" onClick={() => void visible.refetch()}>{t("Thử tải lại")}</Button></div>}
          {visible.isSuccess && !items.length && <p className="py-2 text-sm text-[var(--muted)]">{t("Chưa có ai chia sẻ với bạn.")}</p>}
          <div className="space-y-3">{items.map(item => <article key={item.sessionId} className="rounded-2xl bg-[var(--soft)] p-3">
            <div className="flex items-start justify-between gap-2"><b>{item.ownerDisplayName}</b>
              <span className="text-xs text-[var(--muted)]">{!item.recordedAt ? t("Chưa có vị trí") : isStale(item) ? t("Tạm dừng") : t("Đang cập nhật")}</span></div>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.recordedAt ? `${ago(item.recordedAt)} · ±${Math.round(item.accuracyM ?? 0)} m` : t("Chờ vị trí đầu tiên")}{item.approximate ? t(" · gần đúng") : ""}<br />{t("Hết hạn lúc")} {new Date(item.expiresAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</p>
            <Button variant="ghost" disabled={item.latitude == null || item.longitude == null} onClick={() => setFocus(previous => ({ id: item.sessionId, sequence: (previous?.sequence ?? 0) + 1 }))}>{t("Xem trên bản đồ")}</Button>
          </article>)}</div>

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
        </Card>

        <Card title={state.sessions.length ? t("Phiên chia sẻ của bạn") : t("Chia sẻ vị trí của bạn")}>
          {state.loading && <p role="status">{t("Đang kiểm tra phiên đang mở…")}</p>}
          {state.error && <div role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(new Error(state.error), state.error)} <Button variant="ghost" disabled={state.pending} onClick={() => void sharing.refresh()}>{t("Thử tải lại phiên")}</Button></div>}
          <p role="status" className="mb-3 text-sm">{state.status}</p>
          {state.sessions.length ? <>
            {state.sessions.map(session => <div key={session.id} className="mb-3 rounded-xl bg-[var(--soft)] p-3">
              <p className="text-sm">{t("Hết hạn: {0}{1}", new Date(session.expires_at).toLocaleString(locale), session.approximate ? t(" · gần đúng") : "")}</p>
              <Button variant="danger" disabled={state.pending} className="mt-3 w-full" onClick={() => void sharing.stop(session.id)}><MapPinOff size={18} /> {t("Dừng phiên này")}</Button>
            </div>)}
            {"wakeLock" in navigator && <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={keepAwake} onChange={event => setKeepAwake(event.target.checked)} /> {t("Giữ màn hình sáng khi đang chia sẻ")}</label>}
          </> : <form onSubmit={start} className="space-y-3">
            <PeoplePicker legend={t("Chia sẻ với")} value={recipients} onChange={setRecipients} />
            <label className="block text-sm font-semibold">{t("Thời hạn")}<select className="field mt-1 w-full" value={duration} onChange={event => setDuration(Number(event.target.value))}>
              <option value={15}>{t("15 phút")}</option><option value={60}>{t("1 giờ")}</option><option value={240}>{t("4 giờ")}</option><option value={480}>{t("8 giờ")}</option>
            </select></label>
            <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 text-sm"><input type="checkbox" checked={approximate} onChange={event => setApproximate(event.target.checked)} /> {t("Chỉ chia sẻ vị trí gần đúng (khoảng 100 m)")}</label>
            <Button className="w-full" type="submit" disabled={state.pending || state.loading || !recipients.length}><LocateFixed size={18} /> {t("Bắt đầu chia sẻ")}</Button>
          </form>}
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">{t("Vị trí được gửi khi bạn đang mở ứng dụng, kể cả ở màn hình khác. Khi bạn đóng ứng dụng hoặc tắt màn hình, bạn bè thấy trạng thái “Tạm dừng” cùng vị trí cuối cho tới khi phiên hết hạn hoặc bạn dừng. Tải lại trang không tự bật GPS.")}</p>
        </Card>
      </div>
    </div>
  </div>;
}
