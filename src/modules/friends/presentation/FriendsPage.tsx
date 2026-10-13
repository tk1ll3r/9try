import { useQuery } from "@tanstack/react-query";
import { Ban, CalendarDays, Check, Copy, Link2, MessageCircle, Search, Share2, UserMinus, UserPlus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { matchesSearch } from "../../../kernel/text";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { MoreMenu } from "../../../kernel/ui/MoreMenu";
import { ProfileCardDialog } from "../../identity";
import { onlineLabel, useFriendPresence } from "../../presence";
import { friendsModule } from "../friends.module";
import { friendsKey, useFriendConnections } from "./useFriends";
import { locale, t } from "../../../kernel/i18n";

export function FriendsPage() {
  const friends = useModule(friendsModule);
  const confirm = useConfirm();
  const connections = useFriendConnections();
  const shares = useQuery({ queryKey: [...friendsKey, "shares"], queryFn: () => friends.availabilitySharedWith() });
  const blocked = useQuery({ queryKey: [...friendsKey, "blocked"], queryFn: () => friends.listBlocked() });
  const { run, pending, error } = useAction(friendsKey);
  const online = useFriendPresence();
  const [username, setUsername] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState<{ url: string; expiresAt: string } | null>(null);
  // The friend whose card is open. It stays in the dialog while the dialog closes.
  const [card, setCard] = useState<{ userId: string; name: string } | null>(null);
  const [cardOpen, setCardOpen] = useState(false);

  const items = connections.data ?? [];
  const accepted = items.filter(item => item.status === "accepted");
  const incoming = items.filter(item => item.status === "pending" && item.direction === "incoming");
  const outgoing = items.filter(item => item.status === "pending" && item.direction === "outgoing");
  const shown = search.trim() ? accepted.filter(item => matchesSearch(`${item.displayName} ${item.username ?? ""}`, search.trim())) : accepted;
  const sharedWith = shares.data ?? new Set<string>();
  const loading = connections.isPending;
  const problem = error || (connections.isError ? errorMessage(connections.error, t("Không thể tải bạn bè.")) : "");

  function act(job: () => Promise<unknown>, success = "", after?: () => void) {
    setMessage("");
    run(job, () => { after?.(); setMessage(success); });
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (username.trim()) act(() => friends.sendRequest(username), t("Đã gửi lời mời."), () => setUsername(""));
  }

  async function copyInvite() {
    if (!invite) return;
    try { await navigator.clipboard.writeText(invite.url); setMessage(t("Đã sao chép liên kết.")); }
    catch { setMessage(t("Không sao chép tự động được. Hãy chọn và sao chép liên kết.")); }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">{t("Những người bạn đã kết nối")}</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Bạn bè")}</h1>
        </div>
        {/* The two ways to add someone are at the foot of the page, under a list that grows. */}
        <Button variant="secondary" onClick={() => document.getElementById("friend-username")?.focus()}><UserPlus size={17} /> {t("Thêm bạn")}</Button>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={connections.isFetching} onClick={() => void connections.refetch()}>{t("Thử tải lại")}</Button></div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      {loading && <p role="status">{t("Đang tải bạn bè…")}</p>}

      {incoming.length > 0 && (
        <Card title={t("Đang chờ bạn · {0}", incoming.length)}>
          <div className="space-y-2">
            {incoming.map((item) => (
              <PersonRow key={item.userId} name={item.displayName} username={item.username} avatarUrl={item.avatarUrl} actions={
                <>
                  <Button disabled={pending} className="px-3" onClick={() => act(() => friends.respond(item.userId, true))}><Check size={16} /> {t("Chấp nhận")}</Button>
                  <Button disabled={pending} variant="ghost" className="px-3" onClick={() => act(() => friends.respond(item.userId, false))}><X size={16} /> {t("Từ chối")}</Button>
                </>
              } />
            ))}
          </div>
        </Card>
      )}

      <Card title={t("Bạn bè · {0}", accepted.length)}>
        {!loading && !problem && accepted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">{t("Chưa có bạn nào. Thêm một người bằng username, hoặc gửi cho họ liên kết kết bạn ở bên dưới.")}</p>
        ) : (
          <div className="space-y-2">
            {accepted.length > 8 && <input type="search" className="field mb-1 w-full" aria-label={t("Tìm trong bạn bè")} placeholder={t("Tìm trong bạn bè…")} value={search} onChange={event => setSearch(event.target.value)} />}
            {search.trim() && !shown.length && <p className="py-4 text-center text-sm text-[var(--muted)]">{t("Không có người bạn nào tên như vậy.")}</p>}
            {shown.map((item) => {
              const sharing = sharedWith.has(item.userId);
              return (
                <PersonRow key={item.userId} name={item.displayName} username={item.username} avatarUrl={item.avatarUrl}
                  status={online.get(item.userId)?.state === "idle" ? undefined : online.get(item.userId) && onlineLabel(online.get(item.userId), new Date())}
                  onOpen={() => { setCard({ userId: item.userId, name: item.displayName }); setCardOpen(true); }} actions={
                  <>
                    <Link to={`/chat/with/${item.userId}`} className="pressable inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold"><MessageCircle size={16} /> {t("Nhắn tin")}</Link>
                    <MoreMenu label={t("Thao tác khác với {0}", item.displayName)}>
                      <Link to={`/calendar/shared/${item.userId}`}><CalendarDays size={16} /> {t("Xem lịch và bận/rảnh")}</Link>
                      <button type="button" disabled={pending} aria-pressed={sharing} onClick={() => act(() => friends.setAvailabilityShare(item.userId, !sharing))}><Share2 size={16} /> {sharing ? t("Ngừng chia sẻ bận/rảnh") : t("Chia sẻ bận/rảnh của tôi")}</button>
                      <button type="button" disabled={pending} onClick={async () => {
                        if (await confirm({ title: t("Xóa bạn?"), body: t("{0} sẽ rời danh sách bạn bè của bạn. Những gì hai bạn đang chia sẻ với nhau cũng dừng lại.", item.displayName), action: t("Xóa bạn") })) act(() => friends.remove(item.userId));
                      }}><UserMinus size={16} /> {t("Xóa bạn")}</button>
                      <button type="button" disabled={pending} className="text-[var(--danger)]" onClick={async () => {
                        if (await confirm({ title: t("Chặn {0}?", item.displayName), body: t("Hai bạn sẽ không còn là bạn bè và không gửi được lời mời cho nhau. Bạn bỏ chặn được trong danh sách đã chặn."), action: t("Chặn") })) act(() => friends.block(item.userId));
                      }}><Ban size={16} /> {t("Chặn")}</button>
                    </MoreMenu>
                  </>
                } />
              );
            })}
          </div>
        )}
      </Card>

      {outgoing.length > 0 && (
        <Card title={t("Đã gửi · {0}", outgoing.length)}>
          <div className="space-y-2">
            {outgoing.map((item) => (
              <PersonRow key={item.userId} name={item.displayName} username={item.username} avatarUrl={item.avatarUrl} actions={
                <Button disabled={pending} variant="ghost" onClick={() => act(() => friends.cancelRequest(item.userId))}><X size={16} /> {t("Hủy lời mời")}</Button>
              } />
            ))}
          </div>
        </Card>
      )}

      <Card title={t("Thêm bạn bằng username")}>
        <form onSubmit={send} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 text-[var(--muted)]" size={17} />
            <label className="sr-only" htmlFor="friend-username">{t("Username người bạn muốn mời")}</label>
            <input id="friend-username" className="field w-full pl-10" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t("username chính xác")} required />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}><UserPlus size={17} /> {t("Gửi lời mời")}</Button>
        </form>
      </Card>

      <Card title={t("Mời bằng liên kết")} action={<Link2 size={18} className="text-[var(--muted)]" />}>
        <p className="text-sm leading-6 text-[var(--muted)]">{t("Ai mở liên kết này khi đã đăng nhập sẽ thành bạn của bạn, không cần bạn duyệt. Chỉ gửi cho người bạn tin. Liên kết có hạn 7 ngày, và tạo liên kết mới sẽ hủy liên kết cũ.")}</p>
        {invite ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className="field min-w-0 flex-1" aria-label={t("Liên kết kết bạn")} readOnly value={invite.url} onFocus={e => e.target.select()} />
              <Button variant="secondary" onClick={() => void copyInvite()}><Copy size={17} /> {t("Sao chép")}</Button>
              {"share" in navigator && <Button variant="ghost" onClick={() => void navigator.share({ title: t("Kết bạn trên Gnouht Together"), url: invite.url }).catch(() => undefined)}><Share2 size={17} /> {t("Chia sẻ")}</Button>}
            </div>
            <p className="text-xs text-[var(--muted)]">{t("Hết hạn {0}.", new Date(invite.expiresAt).toLocaleString(locale))}</p>
          </div>
        ) : (
          <Button className="mt-3" variant="secondary" disabled={pending}
            onClick={() => run(() => friends.createInvite(), result => setInvite({ url: `${window.location.origin}/invite/friend/${result.token}`, expiresAt: result.expiresAt }))}>
            <Link2 size={17} /> {t("Tạo liên kết kết bạn")}
          </Button>
        )}
      </Card>

      {(blocked.data?.length ?? 0) > 0 && (
        <Card title={t("Đã chặn · {0}", blocked.data!.length)}>
          <div className="space-y-2">
            {blocked.data!.map(person => (
              <PersonRow key={person.userId} name={person.displayName} username={person.username} actions={
                <Button disabled={pending} variant="ghost" onClick={() => act(() => friends.unblock(person.userId), t("Đã bỏ chặn. Hai bạn chưa là bạn bè trở lại."))}>{t("Bỏ chặn")}</Button>
              } />
            ))}
          </div>
        </Card>
      )}

      {card && <ProfileCardDialog userId={card.userId} name={card.name} open={cardOpen} onOpenChange={setCardOpen}>
        {/* Said in full on the card: a friend who does not share this, or has been away, is "status unavailable". */}
        <p className="w-full text-sm text-[var(--muted)]">{onlineLabel(online.get(card.userId), new Date())}</p>
        <Link to={`/chat/with/${card.userId}`} className="pressable inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)]"><MessageCircle size={16} /> {t("Nhắn tin")}</Link>
        <Link to={`/calendar/shared/${card.userId}`} className="pressable inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--soft)] px-4 text-sm font-semibold"><CalendarDays size={16} /> {t("Xem lịch")}</Link>
      </ProfileCardDialog>}
    </div>
  );
}

/** One person with what can be done about them. With `onOpen`, the picture and the name open the person's card. */
function PersonRow({ name, username, avatarUrl, status, onOpen, actions }: { name: string; username: string | null; avatarUrl?: string | null; status?: string; onOpen?(): void; actions: ReactNode }) {
  const who = <>
    <Avatar name={name} src={avatarUrl} className="size-11 shrink-0 bg-[var(--ink)] font-bold text-[var(--paper)]" />
    <span className="min-w-0 flex-1">
      <span className="block truncate font-bold">{name}</span>
      <span className="block truncate text-xs text-[var(--muted)]">{username ? `@${username}` : t("Chưa có username")}{status && <> · <span className="font-semibold text-emerald-600 dark:text-emerald-400">{status}</span></>}</span>
    </span>
  </>;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
      {/* The name keeps a width of its own. Beside two wide buttons it used to shrink to nothing on a phone; now the buttons go to the next line. */}
      {onOpen ? <button type="button" aria-label={t("Xem hồ sơ của {0}", name)} onClick={onOpen} className="flex min-w-[7.5rem] flex-1 items-center gap-3 rounded-xl text-left">{who}</button>
        : <div className="flex min-w-[7.5rem] flex-1 items-center gap-3">{who}</div>}
      <div className="flex flex-wrap items-center gap-1">{actions}</div>
    </div>
  );
}
