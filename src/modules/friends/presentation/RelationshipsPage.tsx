import { Check, Clock3, Flame, HeartHandshake, MessageCircle, Network, UserPlus, UserRoundPlus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { locale, t } from "../../../kernel/i18n";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { friendsModule } from "../friends.module";
import { layoutRelationshipGraph, relationshipColor, relationshipCurve, type RelationshipMapFriend, type RelationshipMapStatus } from "../domain/relationshipGraph";
import { friendsKey, useFriendConnections, useRelationshipInvites, useSharedRelationships } from "./useFriends";
import { RelationshipInviteDialog } from "./RelationshipInviteDialog";
import { useProfile } from "../../identity";

/** Mutual relationships are always between the signed-in person and one accepted friend. */
export function RelationshipsPage() {
  const repository = useModule(friendsModule);
  const profile = useProfile();
  const friendConnections = useFriendConnections();
  const friends = useMemo(() => (friendConnections.data ?? []).filter(friend => friend.status === "accepted"), [friendConnections.data]);
  const invites = useRelationshipInvites();
  const myRelationships = useSharedRelationships();
  const { run, pending, error } = useAction(friendsKey);
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState("");
  const [inviteTarget, setInviteTarget] = useState<{ userId: string; displayName: string } | null>(null);
  const graphHost = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(358);

  const incomingInvites = useMemo(() => (invites.data ?? []).filter(invite => invite.direction === "incoming"), [invites.data]);
  const outgoingInvites = useMemo(() => (invites.data ?? []).filter(invite => invite.direction === "outgoing"), [invites.data]);
  const relationshipByFriend = useMemo(() => new Map((myRelationships.data ?? []).map(item => [item.friendId, item])), [myRelationships.data]);
  const inviteByFriend = useMemo(() => new Map((invites.data ?? []).map(item => [item.otherUserId, item])), [invites.data]);
  const mapFriends = useMemo<RelationshipMapFriend[]>(() => friends.map(friend => {
    const relationship = relationshipByFriend.get(friend.userId);
    const invite = inviteByFriend.get(friend.userId);
    const status: RelationshipMapStatus = relationship
      ? "connected"
      : invite?.direction === "incoming" ? "incoming"
      : invite?.direction === "outgoing" ? "outgoing"
      : "none";
    return {
      userId: friend.userId,
      displayName: friend.displayName,
      username: friend.username,
      avatarUrl: friend.avatarUrl,
      status,
      relationship: relationship?.relationship ?? invite?.relationship ?? null,
      inviteId: invite?.id ?? null,
    };
  }), [friends, relationshipByFriend, inviteByFriend]);
  const mapReady = friendConnections.isSuccess && invites.isSuccess && myRelationships.isSuccess;

  useLayoutEffect(() => {
    const element = graphHost.current;
    if (!element) return;
    const measure = () => {
      const width = Math.round(element.getBoundingClientRect().width) || 358;
      setGraphWidth(current => current === width ? current : width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mapReady, friends.length]);

  const graph = useMemo(() => layoutRelationshipGraph(mapFriends, graphWidth), [mapFriends, graphWidth]);
  const connectedCount = mapFriends.filter(friend => friend.status === "connected").length;
  const notConnected = mapFriends.filter(friend => friend.status === "none");

  function jumpTo(id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
  }

  function openPerson(person: RelationshipMapFriend) {
    if (person.status === "none") {
      setInviteTarget({ userId: person.userId, displayName: person.displayName });
      return;
    }
    const targetId = person.status === "connected"
      ? `relationship-${person.userId}`
      : `${person.status === "incoming" ? "relationship-invite" : "relationship-sent"}-${person.inviteId}`;
    jumpTo(targetId);
  }

  const inviteId = searchParams.get("invite");
  useEffect(() => {
    if (!inviteId || invites.isPending || invites.isError) return;
    const invitation = incomingInvites.find(item => item.id === inviteId);
    if (invitation) jumpTo(`relationship-invite-${invitation.id}`);
    setSearchParams({}, { replace: true });
  }, [inviteId, invites.isPending, invites.isError, incomingInvites, setSearchParams]);

  const problem = error
    || (friendConnections.isError ? errorMessage(friendConnections.error, t("Không thể tải bạn bè.")) : "")
    || (invites.isError ? errorMessage(invites.error, t("Chưa tải được lời mời quan hệ.")) : "")
    || (myRelationships.isError ? errorMessage(myRelationships.error, t("Chưa tải được danh sách quan hệ.")) : "");
  const retrying = friendConnections.isFetching || invites.isFetching || myRelationships.isFetching;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-col gap-4 rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--lime)_48%,var(--surface)),var(--surface)_72%)] p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7">
      <div className="max-w-3xl space-y-2">
        <div className="hidden size-12 place-items-center rounded-2xl bg-[var(--lime)] text-[var(--ink)] sm:grid"><Network size={22} aria-hidden="true" /></div>
        <p className="hidden pt-1 text-sm font-semibold text-[var(--muted)] sm:block">{t("Kết nối của bạn")}</p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("Quan hệ")}</h1>
        <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Mỗi mối quan hệ là giữa bạn và một người bạn. Một người gửi lời mời; kết nối chỉ xuất hiện khi người kia chấp nhận.")}</p>
      </div>
      <Link to="/me/friends" className="relationship-primary-link inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-[var(--paper)] transition-[transform,box-shadow] duration-200 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <UserPlus size={17} aria-hidden="true" />{t("Mở danh sách bạn bè")}
      </Link>
    </header>

    {problem && <div role="alert" className="flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--danger)] sm:flex-row sm:items-center sm:justify-between">
      <span>{problem}</span>
      <Button variant="ghost" disabled={retrying} onClick={() => void Promise.all([friendConnections.refetch(), invites.refetch(), myRelationships.refetch()])}>{retrying ? t("Đang tải…") : t("Thử tải lại")}</Button>
    </div>}

    {friendConnections.isPending && <Card title={t("Bản đồ quan hệ")}><div role="status" className="skeleton h-64 rounded-3xl" /></Card>}

    {friendConnections.isSuccess && <Card title={t("Bản đồ quan hệ")} action={<span className="rounded-full bg-[var(--soft)] px-3 py-1.5 text-xs font-bold text-[var(--ink)]">{t("Đã xác nhận {0}/{1}", connectedCount, friends.length)}</span>} className="overflow-hidden">
      <p className="mb-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Bạn ở trung tâm. Nét liền là mối quan hệ đã được cả hai xác nhận; nét đứt là lời mời đang chờ. Chạm vào một người để mở đúng thao tác.")}</p>
      <ul aria-label={t("Chú giải bản đồ quan hệ")} className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[var(--muted)]">
        <li className="inline-flex min-h-8 items-center gap-2"><span aria-hidden="true" className="h-0.5 w-6 rounded-full bg-[var(--relationship-friendship)]" />{t("Đã xác nhận")}</li>
        <li className="inline-flex min-h-8 items-center gap-2"><span aria-hidden="true" className="w-6 border-t-2 border-dashed border-[var(--relationship-pending)]" />{t("Đang chờ phản hồi")}</li>
        <li className="inline-flex min-h-8 items-center gap-2"><span aria-hidden="true" className="size-2 rounded-full border-2 border-[var(--border)]" />{t("Chưa kết nối")}</li>
      </ul>

      {invites.isPending || myRelationships.isPending
        ? <div role="status" className="skeleton h-64 rounded-3xl" />
        : invites.isError || myRelationships.isError
          ? <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--muted)]">{t("Bản đồ sẽ hiện khi tải được lời mời và quan hệ.")}</p>
          : <div ref={graphHost} role="group" aria-label={t("Bản đồ quan hệ của {0}", profile.data?.displayName || t("Bạn"))}
              className="relationship-map-surface relative isolate w-full overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)]"
              style={{ height: graph.height, backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in srgb, var(--lime-strong) 24%, transparent) 1px, transparent 0)", backgroundSize: "24px 24px" }}>
            <svg aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${graph.width} ${graph.height}`} preserveAspectRatio="none">
              {graph.edges.map(edge => <path key={edge.friendId} d={relationshipCurve(edge.a, edge.b)} fill="none" stroke={edge.color}
                strokeWidth={edge.status === "connected" ? 3 : 2.5} strokeLinecap="round" strokeOpacity={edge.status === "connected" ? ".76" : ".64"}
                strokeDasharray={edge.status === "connected" ? undefined : "6 7"} />)}
            </svg>

            <div className="absolute z-[2] flex h-[4.75rem] w-[min(11.5rem,calc(100%-1rem))] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-2xl border-2 border-[var(--ink)] bg-[var(--surface)] px-3 shadow-md" style={{ left: graph.self.x, top: graph.self.y }}>
              <Avatar name={profile.data?.displayName || t("Bạn")} src={profile.data?.avatarUrl} className="size-10 shrink-0 bg-[var(--soft)] text-sm font-black" />
              <span className="min-w-0"><span className="block truncate text-sm font-black">{profile.data?.displayName || t("Bạn")}</span><span className="block truncate text-xs text-[var(--muted)]">{profile.data?.username ? `@${profile.data.username}` : t("Bạn")}</span></span>
            </div>

            {graph.nodes.map(person => {
              const statusLabel = person.status === "connected" ? person.relationship || t("Đã xác nhận")
                : person.status === "incoming" ? t("Lời mời đến")
                : person.status === "outgoing" ? t("Đang chờ")
                : t("Chưa có quan hệ chung");
              const StatusIcon = person.status === "connected" ? Check : person.status === "none" ? UserPlus : Clock3;
              const accessibleLabel = person.status === "connected"
                ? t("Mở quan hệ {0}: {1}", person.displayName, person.relationship || t("Đã xác nhận"))
                : person.status === "incoming" ? t("Mở lời mời quan hệ từ {0}", person.displayName)
                : person.status === "outgoing" ? t("Mở lời mời bạn đã gửi cho {0}", person.displayName)
                : t("Gửi lời mời quan hệ cho {0}", person.displayName);
              return <button key={person.userId} type="button" onClick={() => openPerson(person)} aria-label={accessibleLabel} title={accessibleLabel}
                className="relationship-map-node absolute z-[2] flex min-h-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-2xl border bg-[var(--surface)] px-2 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)] active:scale-[.98]"
                style={{ left: person.x, top: person.y, width: graph.nodeWidth, borderColor: person.status === "connected" ? relationshipColor(person.relationship ?? "") : "var(--border)" }}>
                <Avatar name={person.displayName} src={person.avatarUrl} className="size-8 shrink-0 bg-[var(--soft)] text-xs font-black" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{person.displayName}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] leading-4" style={person.status === "connected" ? { color: relationshipColor(person.relationship ?? "") } : undefined}>
                    <StatusIcon size={11} aria-hidden="true" className="shrink-0" />
                    <span className="truncate" title={statusLabel}>{statusLabel}</span>
                  </span>
                </span>
              </button>;
            })}
          </div>}

    </Card>}

    {incomingInvites.length > 0 && <Card title={t("Lời mời bạn nhận · {0}", incomingInvites.length)}>
      <ul className="space-y-2">
        {incomingInvites.map(invite => <li id={`relationship-invite-${invite.id}`} key={invite.id} tabIndex={-1} className="scroll-mt-28 rounded-2xl border border-[var(--border)] bg-[var(--soft)]/55 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar name={invite.otherName} src={invite.otherAvatarUrl} className="size-11 shrink-0 bg-[var(--surface)] text-sm font-black" />
            <span className="min-w-0 flex-1 text-sm"><b className="block truncate">{invite.otherName}</b><span className="text-[var(--muted)]">{t("Mời bạn: {0}", invite.relationship)}</span></span>
            <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--relationship-pending)]"><HeartHandshake size={14} aria-hidden="true" />{t("Cần bạn phản hồi")}</span>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button className="flex-1 sm:flex-none" disabled={pending} onClick={() => run(() => repository.respondRelationshipInvite(invite.id, true), () => setNotice(t("Đã chấp nhận lời mời quan hệ.")))}>{t("Chấp nhận")}</Button>
              <Button className="flex-1 sm:flex-none" variant="ghost" disabled={pending} onClick={() => run(() => repository.respondRelationshipInvite(invite.id, false), () => setNotice(t("Đã từ chối lời mời.")))}>{t("Từ chối")}</Button>
            </div>
          </div>
        </li>)}
      </ul>
    </Card>}

    <Card title={t("Quan hệ đã xác nhận · {0}", myRelationships.data?.length ?? 0)}>
      {myRelationships.isPending ? <div role="status" className="skeleton h-24 rounded-2xl" /> : myRelationships.isError ? <p role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{t("Chưa tải được danh sách quan hệ.")}</p> : myRelationships.data?.length ? <ul className="grid gap-3 sm:grid-cols-2">
        {myRelationships.data.map(item => <li id={`relationship-${item.friendId}`} key={item.friendId} tabIndex={-1} className="scroll-mt-28 flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          <Avatar name={item.friendName} src={item.friendAvatarUrl} className="size-12 shrink-0 bg-[var(--soft)] font-bold" />
          <span className="min-w-0 flex-1">
            <b className="block truncate">{item.friendName}</b>
            <span className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-bold" style={{ color: relationshipColor(item.relationship) }}>
              <HeartHandshake size={13} aria-hidden="true" />{item.relationship}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
              {item.currentStreak > 0
                ? <span aria-label={t("Chuỗi nhắn tin: {0} ngày", item.currentStreak)} className="inline-flex items-center gap-1 font-bold text-[var(--ink)]"><Flame size={14} aria-hidden="true" className="text-orange-500" />{t("Chuỗi {0} ngày", item.currentStreak)}</span>
                : <span>{t("Nhắn tin mỗi ngày để bắt đầu chuỗi")}</span>}
              <span aria-hidden="true">·</span><span>{t("Từ")} {new Date(item.createdAt).toLocaleDateString(locale)}</span>
            </span>
          </span>
          <Link to={`/chat/with/${item.friendId}`} className="relationship-chat-link inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--soft)] px-3 text-sm font-bold sm:ml-auto sm:w-auto"><MessageCircle size={16} aria-hidden="true" />{t("Nhắn tin")}</Link>
        </li>)}
      </ul> : <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--muted)]">{t("Chưa có quan hệ nào được cả hai xác nhận. Chọn một bạn trên bản đồ để gửi lời mời.")}</p>}
    </Card>

    {outgoingInvites.length > 0 && <Card title={t("Lời mời bạn đã gửi · {0}", outgoingInvites.length)}>
      <ul className="space-y-2">{outgoingInvites.map(invite => <li id={`relationship-sent-${invite.id}`} key={invite.id} tabIndex={-1} className="scroll-mt-28 flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <Avatar name={invite.otherName} src={invite.otherAvatarUrl} className="size-10 shrink-0 bg-[var(--surface)] text-xs font-black" />
        <span className="min-w-0 flex-1 text-sm"><b className="block truncate">{invite.otherName}</b><span className="block truncate text-[var(--muted)]">{t("Đề nghị: {0} · Đang chờ", invite.relationship)}</span></span>
        <Button className="w-full sm:w-auto" variant="ghost" disabled={pending} onClick={() => run(() => repository.cancelRelationshipInvite(invite.id), () => setNotice(t("Đã hủy lời mời.")))}>{t("Hủy lời mời")}</Button>
      </li>)}</ul>
    </Card>}

    {invites.isSuccess && myRelationships.isSuccess && notConnected.length > 0 && <Card title={t("Mời bạn bè tạo kết nối · {0}", notConnected.length)}>
      <p className="mb-3 text-sm leading-6 text-[var(--muted)]">{t("Lời mời chỉ tạo kết nối giữa bạn với người được mời. Người ấy có thể chấp nhận hoặc từ chối.")}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {notConnected.map(friend => <li key={friend.userId} className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
          <Avatar name={friend.displayName} src={friend.avatarUrl} className="size-10 shrink-0 bg-[var(--surface)] text-xs font-black" />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">{friend.displayName}</span>
          <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setInviteTarget({ userId: friend.userId, displayName: friend.displayName })}><HeartHandshake size={16} aria-hidden="true" />{t("Gửi lời mời quan hệ")}</Button>
        </li>)}
      </ul>
    </Card>}

    {friendConnections.isSuccess && friends.length === 0 && <Card className="py-8 text-center">
      <UserRoundPlus size={30} aria-hidden="true" className="mx-auto text-[var(--muted)]" />
      <h2 className="mt-3 font-bold">{t("Thêm bạn bè để bắt đầu")}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--muted)]">{t("Kết bạn trước, rồi gửi lời mời quan hệ riêng cho từng người.")}</p>
      <Link to="/me/friends" className="relationship-primary-link mt-4 inline-flex min-h-11 items-center justify-center rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)]">{t("Mở danh sách bạn bè")}</Link>
    </Card>}

    {notice && <p role="status" className="rounded-2xl bg-[var(--soft)] p-3 text-sm text-[var(--success)]">{notice}</p>}
    {inviteTarget && <RelationshipInviteDialog friendId={inviteTarget.userId} friendName={inviteTarget.displayName} open onOpenChange={open => { if (!open) setInviteTarget(null); }} />}
  </div>;
}
