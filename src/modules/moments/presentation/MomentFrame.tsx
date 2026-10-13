import { Camera, ChevronLeft, ChevronRight, Images, Plus } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../../kernel/ui/Avatar";
import { useUserId } from "../../../kernel/session";
import { ago, byPerson, frameOrder, homeWarmPaths, live, openingMoment } from "../domain/Moment";
import { ModeChip } from "./ModeChip";
import { useMomentStreaks, useMoments, useNow, useSeen, useWarmedAddresses } from "./useMoments";
import { t } from "../../../kernel/i18n";

// Opened now and then, so the form stays out of the home screen's download.
const MomentComposer = lazy(() => import("./MomentComposer").then(m => ({ default: m.MomentComposer })));

/**
 * The frame on the Mode screen: the photos friends posted in the last 24 hours, one at a time, what
 * the person has not looked at first. The edges turn to the next and the previous photo, the middle
 * opens that friend's photos, and the plus posts one. `mode` is the activity the person has on,
 * `onSetMode` turns one on.
 */
export function MomentFrame({ mode, modeMinutes = 120, captureRequest = 0, className = "" }: { mode?: string; modeMinutes?: number; captureRequest?: number; className?: string }) {
  const moments = useMoments();
  const streaks = useMomentStreaks();
  const userId = useUserId();
  const now = useNow();
  const [at, setAt] = useState(0);
  const [posting, setPosting] = useState(false);
  const swipe = useRef<{ from: number; moved: boolean } | null>(null);

  useEffect(() => { if (captureRequest > 0) setPosting(true); }, [captureRequest]);

  const alive = live(moments.data ?? [], now);
  // The order is fixed while the same photos are there, so looking at one does not reshuffle the frame under the finger.
  const set = alive.map(moment => moment.id).sort().join();
  const order = useMemo(() => frameOrder(alive, now).map(moment => moment.id), [set]);
  const byId = new Map(alive.map(moment => [moment.id, moment]));
  const shown = order.flatMap(id => { const moment = byId.get(id); return moment ? [moment] : []; });
  const index = Math.min(at, Math.max(0, shown.length - 1));
  const current = shown[index];
  // The photo on screen, two ahead, and the photo each next person opens on. One sign request,
  // then the files start. The rest of a long day waits until the run reaches it.
  const openings = useMemo(() => byPerson(alive, now).map(person => openingMoment(person).path), [set]);
  const addresses = useWarmedAddresses(homeWarmPaths(shown.map(moment => moment.path), index, openings));
  useSeen(current);
  const composer = posting && <Suspense fallback={null}><MomentComposer open onOpenChange={setPosting} mode={mode} modeMinutes={modeMinutes} /></Suspense>;

  // A server that has no photos yet: the Mode screen is as it was.
  if (moments.isError) return composer ?? null;

  if (!current) return <section aria-label={t("Khoảnh khắc")} className={className}>
    {moments.isPending ? <div className="skeleton h-20" /> : <div className="flex items-center gap-3 rounded-[1.75rem] border border-dashed border-[var(--border)] p-3">
      <button id="post-moment" type="button" aria-label={t("Đăng ảnh")} onClick={() => setPosting(true)} className="pressable grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--lime)] text-[var(--ink)]"><Camera size={22} /></button>
      <p className="text-sm leading-6 text-[var(--muted)]"><b className="block text-[var(--ink)]">{t("Khoảnh khắc")}</b>{t("Chưa có ảnh nào trong 24 giờ qua. Đăng một tấm để bạn bè thấy bạn đang làm gì.")}{(streaks.get(userId) ?? 0) >= 3 && <span className="mt-1 block font-bold text-[var(--ink)]">🔥 {t("Chuỗi đăng tin {0} ngày", streaks.get(userId)!)}</span>}</p>
    </div>}
    {!moments.isPending && <Link to="/moments/archive" className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--soft)]"><Images size={17} /> {t("Mở kho ảnh đã lưu")}</Link>}
    {composer}
  </section>;

  const turn = (step: number) => setAt(Math.min(shown.length - 1, Math.max(0, index + step)));
  // A drag across the frame turns the page; a tap goes through to what is under the finger.
  const down = (event: PointerEvent) => { swipe.current = { from: event.clientX, moved: false }; };
  const up = (event: PointerEvent) => {
    const drag = swipe.current;
    if (!drag) return;
    const moved = event.clientX - drag.from;
    if (Math.abs(moved) > 40) { drag.moved = true; turn(moved < 0 ? 1 : -1); }
    // The browser dispatches the corresponding click immediately after pointerup. Clear the guard
    // on the next task too, in case a drag does not produce that click (or the user activates by keyboard).
    window.setTimeout(() => { swipe.current = null; }, 0);
  };
  const address = addresses.get(current.path);
  const who = current.mine ? t("Bạn") : current.ownerName;
  const edge = "absolute inset-y-0 z-10 flex w-1/4 items-center text-white/0 transition-colors hover:text-white focus-visible:text-white disabled:hidden";

  return <section aria-label={t("Khoảnh khắc")} className={className}>
    <div onPointerDown={down} onPointerUp={up} onClickCapture={event => { if (swipe.current?.moved) { event.preventDefault(); event.stopPropagation(); swipe.current = null; } }}
      className="relative mx-auto aspect-[4/5] w-full touch-pan-y select-none overflow-hidden rounded-[2rem] bg-[#1a1218] shadow-[0_24px_60px_-28px_rgba(0,0,0,.55)]">
      {address
        ? <img key={current.id} src={address} draggable={false} alt={current.caption ? t("Ảnh của {0}: {1}", who, current.caption) : t("Ảnh của {0}", who)} fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-cover" />
        : <div role="status" aria-label={t("Đang tải ảnh")} className="skeleton absolute inset-0 !rounded-none" />}
      <div aria-hidden className="absolute inset-x-3 top-3 z-10 flex gap-1">{shown.slice(0, 16).map((moment, tick) => <span key={moment.id} className={`h-1 flex-1 rounded-full ${tick === index ? "bg-white" : "bg-white/40"}`} />)}</div>
      <Link to={`/moments/${current.ownerId}/${current.id}`} aria-label={t("Mở ảnh của {0}", who)} className="absolute inset-0" />
      <button type="button" aria-label={t("Ảnh trước")} disabled={index === 0} onClick={() => turn(-1)} className={`${edge} left-0 justify-start pl-1`}><ChevronLeft size={26} /></button>
      <button type="button" aria-label={t("Ảnh sau")} disabled={index === shown.length - 1} onClick={() => turn(1)} className={`${edge} right-0 justify-end pr-1`}><ChevronRight size={26} /></button>
      <button id="post-moment" type="button" aria-label={t("Đăng ảnh")} onClick={() => setPosting(true)} className="pressable absolute right-3 top-7 z-20 grid size-11 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)] shadow-lg"><Plus size={22} /></button>
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-black/50 p-2.5 text-white backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Avatar name={current.ownerName} src={current.ownerAvatarUrl} className="size-8 shrink-0 bg-white text-sm font-black text-[#24151f]" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5"><b className="block truncate text-sm">{who}</b>{(streaks.get(current.ownerId) ?? 0) >= 3 && <span aria-label={t("Chuỗi đăng tin {0} ngày", streaks.get(current.ownerId)!)} className="shrink-0 rounded-full bg-[var(--lime)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink)]">🔥 {streaks.get(current.ownerId)}</span>}</span>
            <span className="block truncate text-[11px] text-white/75">{ago(current.createdAt, now)}{!current.seen && <> · <b className="text-[var(--lime)]">{t("mới")}</b></>}</span>
          </span>
          <ModeChip mode={current.mode} label={current.modeLabel} icon={current.modeIcon} color={current.modeColor} />
        </div>
        {current.caption && <p className="mt-1.5 line-clamp-2 break-words text-sm leading-5">{current.caption}</p>}
      </div>
    </div>
    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
      <p>{t("Ảnh {0}/{1} trong story 24 giờ.", index + 1, shown.length)}</p>
      <Link to="/moments/archive" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 font-semibold hover:bg-[var(--soft)]"><Images size={15} /> {t("Kho ảnh")}</Link>
    </div>
    {(streaks.get(userId) ?? 0) >= 3 && <p role="status" className="mt-1 inline-flex rounded-full bg-[var(--lime)] px-3 py-1 text-xs font-bold text-[var(--ink)]">🔥 {t("Chuỗi đăng tin {0} ngày", streaks.get(userId)!)}</p>}
    {composer}
  </section>;
}
