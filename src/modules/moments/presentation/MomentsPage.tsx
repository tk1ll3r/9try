import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Images, MessageCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { ShareToChatButton } from "../../chat";
import { ago, byPerson, openingMoment, reactionSigns, signOf, viewerWarmPaths, type Reaction } from "../domain/Moment";
import { momentsModule } from "../moments.module";
import { ModeChip } from "./ModeChip";
import { momentsKey, useMomentStreaks, useMoments, useNow, useSeen, useWarmedAddresses } from "./useMoments";
import { locale, t } from "../../../kernel/i18n";

const reactionNames: Record<Reaction, string> = { heart: t("Tim"), laugh: t("Cười"), wow: t("Ngạc nhiên"), sad: t("Buồn"), fire: t("Lửa"), like: t("Thích") };

/**
 * One person's photos of the last 24 hours, one at a time in the order they were taken, with the
 * other people who have photos along the top. Under a friend's photo: a reaction and a reply. Under
 * one's own: who looked, and a way to remove it.
 */
export function MomentsPage() {
  const { userId: wanted, momentId: wantedMoment } = useParams();
  const repository = useModule(momentsModule);
  const userId = useUserId();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const moments = useMoments();
  const streaks = useMomentStreaks();
  const now = useNow();
  const { run, pending, error } = useAction(momentsKey);
  const [asked, setAsked] = useState("");

  const people = byPerson(moments.data ?? [], now);
  const person = wanted ? people.find(item => item.ownerId === wanted) : people[0];
  // A photo URL always selects that ID. A missing/expired photo stays unavailable instead of
  // falling through to a newer photo from the same person.
  const exactIndex = person && wantedMoment ? person.moments.findIndex(moment => moment.id === wantedMoment) : -1;
  const invalidTarget = !!wantedMoment && (!person || exactIndex < 0);
  const opening = person ? person.moments.findIndex(moment => moment.id === openingMoment(person).id) : 0;
  const index = wantedMoment ? exactIndex : opening;
  const current = person && index >= 0 ? person.moments[index] : undefined;
  const place = people.findIndex(item => item.ownerId === person?.ownerId);
  const nextPerson = people[place + 1];
  const addresses = useWarmedAddresses(person && index >= 0
    ? viewerWarmPaths(person.moments.map(moment => moment.path), index, nextPerson ? openingMoment(nextPerson).path : null)
    : []);
  useSeen(current);
  const viewers = useQuery({ queryKey: [...momentsKey, "viewers", current?.id], queryFn: () => repository.viewers(current!.id), enabled: !!current?.mine && asked === current.id });

  function turn(step: number) {
    if (!person) return;
    const next = index + step;
    if (next >= 0 && next < person.moments.length) { navigate(`/moments/${person.ownerId}/${person.moments[next].id}`, { replace: true }); return; }
    // Past the last photo of one person comes the next person; before the first, the one before.
    const other = people[place + step];
    if (other) navigate(`/moments/${other.ownerId}/${openingMoment(other).id}`, { replace: true });
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, textarea, [role=dialog], [role=alertdialog]")) return;
      if (event.key === "ArrowRight") turn(1);
      if (event.key === "ArrowLeft") turn(-1);
      if (event.key === "Escape") navigate("/");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const who = (name: string, mine: boolean) => mine ? t("Bạn") : name;
  const side = "absolute inset-y-0 z-10 flex w-1/4 items-center text-white/0 transition-colors hover:text-white focus-visible:text-white";
  const address = current && addresses.get(current.path);
  const taken = current && new Date(current.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  return <div className="mx-auto max-w-3xl space-y-4">
    <header className="flex items-center gap-2">
      <Link to="/" aria-label={t("Về Mode")} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--soft)]"><ArrowLeft size={18} /></Link>
      <div className="min-w-0 flex-1"><h1 className="text-2xl font-black tracking-tight">{t("Khoảnh khắc")}</h1><p className="text-xs text-[var(--muted)]">{t("Story hiện trong 24 giờ. Ảnh được lưu ngay vào kho riêng.")}</p>{(streaks.get(userId) ?? 0) >= 3 && <p className="mt-1 text-xs font-bold text-[var(--ink)]">🔥 {t("Chuỗi đăng tin {0} ngày", streaks.get(userId)!)}</p>}</div>
      <Link to="/moments/archive" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold hover:bg-[var(--soft)]"><Images size={17} /><span className="hidden sm:inline">{t("Kho ảnh")}</span></Link>
    </header>

    {moments.isPending && <div role="status" aria-label={t("Đang tải ảnh")} className="skeleton mx-auto aspect-[4/5] max-w-sm" />}
    {moments.isError && <p role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{errorMessage(moments.error, t("Chưa tải được ảnh."))}</p>}

    {people.length > 0 && <nav aria-label={t("Người có ảnh")} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pt-1 sm:mx-0 sm:px-1">
      {people.map(item => <Link key={item.ownerId} to={`/moments/${item.ownerId}`} replace aria-current={item.ownerId === person?.ownerId ? "page" : undefined}
        aria-label={item.unseen ? t("{0}: {1} ảnh mới", who(item.ownerName, item.mine), item.unseen) : t("{0}: {1} ảnh", who(item.ownerName, item.mine), item.moments.length)}
        className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
        <span className={`rounded-full p-[3px] ${item.unseen ? "bg-[var(--lime-strong)]" : item.ownerId === person?.ownerId ? "bg-[var(--ink)]" : "bg-[var(--border)]"}`}>
          <Avatar name={item.ownerName} src={item.ownerAvatarUrl} className="size-12 border-2 border-[var(--surface)] bg-[var(--soft)] font-black" />
        </span>
        <span className="max-w-full truncate text-xs font-semibold">{who(item.ownerName, item.mine)}</span>
        {(streaks.get(item.ownerId) ?? 0) >= 3 && <span aria-label={t("Chuỗi đăng tin {0} ngày", streaks.get(item.ownerId)!)} className="rounded-full bg-[var(--lime)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--ink)]">🔥 {streaks.get(item.ownerId)}</span>}
      </Link>)}
    </nav>}

    {moments.isSuccess && !current && <div className="rounded-3xl bg-[var(--soft)] p-6 text-center text-sm leading-6 text-[var(--muted)]">
      <p>{invalidTarget ? t("Ảnh này không còn, đã hết hạn hoặc bạn không thể xem.") : wanted && people.length ? t("Người này không còn ảnh nào trong 24 giờ qua.") : t("Chưa có ảnh nào trong 24 giờ qua.")}</p>
      {invalidTarget && person && <Link to={`/moments/${person.ownerId}`} className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t("Mở ảnh còn lại của người này")}</Link>}
      <Link to="/" className="mt-2 inline-flex min-h-11 items-center font-semibold underline">{t("Về Mode")}</Link>
    </div>}

    {person && current && <article aria-label={t("Ảnh của {0}", who(person.ownerName, person.mine))}>
      <div className="relative mx-auto w-full overflow-hidden rounded-[2rem] bg-[#1a1218]" style={{ aspectRatio: `${current.width} / ${current.height}`, maxHeight: "68dvh", maxWidth: `calc(68dvh * ${current.width} / ${current.height})` }}>
        {address
          ? <img key={current.id} src={address} draggable={false} alt={current.caption ? t("Ảnh của {0}: {1}", who(person.ownerName, person.mine), current.caption) : t("Ảnh của {0}", who(person.ownerName, person.mine))} fetchPriority="high" decoding="async" className="absolute inset-0 size-full object-contain" />
          : <div role="status" aria-label={t("Đang tải ảnh")} className="skeleton absolute inset-0 !rounded-none" />}
        <div aria-hidden className="absolute inset-x-3 top-3 z-10 flex gap-1">{person.moments.map((moment, tick) => <span key={moment.id} className={`h-1 flex-1 rounded-full ${tick === index ? "bg-white" : "bg-white/40"}`} />)}</div>
        {(index > 0 || place > 0) && <button type="button" aria-label={t("Ảnh trước")} onClick={() => turn(-1)} className={`${side} left-0 justify-start pl-1`}><ChevronLeft size={28} /></button>}
        {(index < person.moments.length - 1 || place < people.length - 1) && <button type="button" aria-label={t("Ảnh sau")} onClick={() => turn(1)} className={`${side} right-0 justify-end pr-1`}><ChevronRight size={28} /></button>}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Avatar name={person.ownerName} src={person.ownerAvatarUrl} className="size-10 shrink-0 bg-[var(--ink)] font-black text-[var(--paper)]" />
        <div className="min-w-0 flex-1"><b className="block truncate">{who(person.ownerName, person.mine)}</b><span className="text-xs text-[var(--muted)]">{t("{0} · ảnh {1}/{2}", ago(current.createdAt, now), index + 1, person.moments.length)}</span></div>
        <ModeChip mode={current.mode} label={current.modeLabel} icon={current.modeIcon} color={current.modeColor} className="!text-xs" />
      </div>
      {current.caption && <p className="mt-2 break-words leading-6">{current.caption}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}

      {!current.mine && <div className="mt-3 flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("Thả cảm xúc")} className="flex gap-1 rounded-full bg-[var(--soft)] p-1">
          {reactionSigns.map(([key, sign]) => <button key={key} type="button" aria-label={reactionNames[key]} aria-pressed={current.myReaction === key} disabled={pending}
            onClick={() => run(() => repository.react(current.id, current.myReaction === key ? null : key))}
            className={`grid size-11 place-items-center rounded-full text-xl transition-transform duration-200 ease-[var(--ease-spring)] hover:scale-110 active:scale-90 ${current.myReaction === key ? "bg-[var(--surface)] shadow" : ""}`}>{sign}</button>)}
        </div>
        {/* The answer goes to the chat with that friend, with the photo attached as a card. */}
        <Link to={`/chat/with/${person.ownerId}?ref=${encodeURIComponent(`/moments/${person.ownerId}/${current.id}`)}&title=${encodeURIComponent(t("Ảnh của {0} lúc {1}", person.ownerName, taken))}`} className="pressable inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)]"><MessageCircle size={17} /> {t("Trả lời")}</Link>
        <ShareToChatButton path={`/moments/${person.ownerId}/${current.id}`} title={t("Ảnh của {0} lúc {1}", person.ownerName, taken)} />
      </div>}

      {current.mine && <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" aria-expanded={asked === current.id} onClick={() => setAsked(asked === current.id ? "" : current.id)}><Eye size={17} /> {t("{0} người đã xem", current.views)}</Button>
          {Object.entries(current.reactions).map(([key, count]) => <span key={key} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[var(--soft)] px-3 text-sm font-semibold">{signOf(key)} {count}</span>)}
          <Button variant="ghost" className="ml-auto text-[var(--danger)]" disabled={pending} onClick={async () => {
          if (await confirm({ title: t("Xóa ảnh này?"), body: t("Ảnh bị xóa khỏi story và kho lưu trữ."), action: t("Xóa ảnh") })) run(() => repository.remove(current.id), () => { if (person.moments.length === 1) navigate("/"); });
          }}><Trash2 size={17} /> {t("Xóa ảnh")}</Button>
        </div>
        <p className="text-xs text-[var(--muted)]">{current.audience === "friends" ? t("Ảnh này hiện với mọi bạn bè của bạn.") : t("Ảnh này chỉ hiện với những người bạn đã chọn.")}</p>
        {asked === current.id && <div className="rounded-2xl bg-[var(--soft)] p-3 text-sm">
          {viewers.isPending && <p role="status">{t("Đang tải…")}</p>}
          {viewers.isError && <p role="alert" className="text-[var(--danger)]">{errorMessage(viewers.error, t("Chưa tải được danh sách."))}</p>}
          {viewers.data?.length === 0 && <p className="text-[var(--muted)]">{t("Chưa ai xem ảnh này.")}</p>}
          <ul className="space-y-2">{viewers.data?.map(viewer => <li key={viewer.userId} className="flex items-center gap-2">
            <Avatar name={viewer.name} src={viewer.avatarUrl} className="size-8 shrink-0 bg-[var(--surface)] text-xs font-black" />
            <span className="min-w-0 flex-1 truncate font-semibold">{viewer.name}</span>
            {viewer.reaction && <span aria-label={reactionNames[viewer.reaction]}>{signOf(viewer.reaction)}</span>}
            <span className="shrink-0 text-xs text-[var(--muted)]">{ago(viewer.seenAt, now)}</span>
          </li>)}</ul>
        </div>}
      </div>}
    </article>}
  </div>;
}
