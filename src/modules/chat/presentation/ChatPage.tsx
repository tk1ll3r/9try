import { ArrowLeft, BellOff, Hourglass, MessageCircle, SlidersHorizontal, UsersRound } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Avatar } from "../../../kernel/ui/Avatar";
import { useAcceptedFriends } from "../../friends";
import { useMyGroups } from "../../groups";
import { chatModule } from "../chat.module";
import { cleanChatTitle, roomTitle, type Room } from "../domain/Chat";
import { ConversationInfo } from "./ConversationInfo";
import { RoomBar } from "./RoomBar";
import { roomTime } from "./roomTime";
import { Thread } from "./Thread";
import { chatKey, useConversations, useRooms } from "./useChat";
import { t } from "../../../kernel/i18n";

/** Phone: the list, or one conversation. Desktop: both side by side. */
export function ChatPage() {
  const { conversationId } = useParams();
  const me = useUserId();
  const friends = useAcceptedFriends();
  const groups = useMyGroups();
  const [infoOpen, setInfoOpen] = useState(false);
  const [jump, setJump] = useState<{ id: string; token: number } | null>(null);
  const conversations = useConversations();
  const rooms = useRooms();
  const open = conversations.data?.find(conversation => conversation.id === conversationId);
  const openFriend = open?.kind === "direct" ? friends.find(friend => friend.userId === open.otherUserId) : undefined;
  const roomOf = (id: string | undefined) => rooms.data?.find(room => room.id === id);
  const openRoom = roomOf(conversationId);
  // Open rooms the person may join and has not: an event's or a meetup's discussion, a friend's mode.
  const joinable = (rooms.data ?? []).filter(room => !room.joined && !room.closed && !room.removed);
  // The address of a room the person is not in: from a notification, or from a friend's card.
  const atTheDoor = !!conversationId && !open && conversations.isSuccess && rooms.isSuccess;
  const titleOf = (id: string, fallback: string) => {
    const room = roomOf(id);
    const conversation = conversations.data?.find(item => item.id === id);
    const friend = conversation?.kind === "direct" ? friends.find(item => item.userId === conversation.otherUserId) : undefined;
    return room ? roomTitle(room) : friend?.displayName ?? cleanChatTitle(fallback);
  };
  // Who may take back anyone's message here: the owner and the admins of a group, the person who opened a room.
  const role = open?.kind === "group" ? groups.data?.find(group => group.id === open.groupId)?.role : undefined;
  const moderator = role === "owner" || role === "admin" || (open?.kind === "room" && open.ownerId === me);

  return (
    <div className="grid h-[calc(100dvh-8.5rem)] gap-5 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[20rem_1fr]">
      <section className={`min-h-0 flex-col ${conversationId ? "hidden lg:flex" : "flex"}`}>
        <header className="pr-14 lg:pr-0">
          <p className="text-sm font-semibold text-[var(--muted)]">{t("Với bạn bè và nhóm của bạn")}</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Trò chuyện")}</h1>
        </header>
        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {joinable.length > 0 && <section aria-label={t("Thảo luận đang mở")} className="mb-3 space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">{t("Thảo luận đang mở · {0}", joinable.length)}</h2>
            {joinable.map(room => <Link key={room.id} to={`/chat/${room.id}`} className="flex min-h-14 items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-[var(--border)] p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Hourglass size={18} /></span>
              <span className="min-w-0 flex-1 overflow-hidden"><span className="block truncate font-bold">{roomTitle(room)}</span><span className="block truncate text-sm text-[var(--muted)]">{room.source.kind === "mode" ? t("Thảo luận mở bởi {0}", room.ownerName) : t("{0} người · {1}", room.memberCount, roomTime(room, Date.now()))}</span></span>
              <span className="shrink-0 text-sm font-semibold underline">{t("Tham gia")}</span>
            </Link>)}
          </section>}
          {conversations.isPending && <p role="status">{t("Đang tải…")}</p>}
          {conversations.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(conversations.error, t("Không tải được các cuộc trò chuyện."))}</p>}
          {conversations.data?.length === 0 && !joinable.length && <p className="rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--muted)]">{t("Chưa có cuộc trò chuyện nào. Mở")} <Link className="font-semibold underline" to="/me/friends">{t("Bạn bè")}</Link> {t("và bấm “Nhắn tin”, hoặc mở một nhóm và bấm “Trò chuyện nhóm”.")}</p>}
          {(conversations.data ?? []).map(conversation => {
            const room = roomOf(conversation.id);
            const friend = conversation.kind === "direct" ? friends.find(item => item.userId === conversation.otherUserId) : undefined;
            return <Link key={conversation.id} to={`/chat/${conversation.id}`} aria-current={conversation.id === conversationId ? "page" : undefined}
              className={`flex min-h-16 items-center gap-3 overflow-hidden rounded-2xl p-3 ${conversation.id === conversationId ? "bg-[var(--soft)]" : "bg-[var(--surface)] hover:bg-[var(--soft)]"}`}>
              {friend ? <Avatar name={friend.displayName} src={friend.avatarUrl} className="size-11 shrink-0 bg-[var(--ink)] font-black text-[var(--paper)]" /> : <span className={`grid size-11 shrink-0 place-items-center rounded-full font-bold ${conversation.kind === "room" ? "bg-[var(--lime)] text-[var(--ink)]" : "bg-[var(--ink)] text-[var(--paper)]"}`}>
                {conversation.kind === "group" ? <UsersRound size={18} /> : conversation.kind === "room" ? <Hourglass size={18} /> : conversation.title.slice(0, 1).toUpperCase()}
              </span>}
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="block truncate font-bold">{titleOf(conversation.id, conversation.title)}</span>
                <span className="block truncate text-sm text-[var(--muted)]">{room?.source.kind === "mode" ? t("Thảo luận mở bởi {0}", room.ownerName) : room?.closed ? roomTime(room, Date.now()) : conversation.lastMessageBody ?? t("Chưa có tin nhắn")}</span>
              </span>
              {conversation.muted && <BellOff size={15} aria-label={t("Đang tắt thông báo")} className="shrink-0 text-[var(--muted)]" />}
              {conversation.unreadCount > 0 && <span aria-label={t("{0} tin chưa đọc", conversation.unreadCount)} className="grid min-w-6 shrink-0 place-items-center rounded-full bg-red-600 px-1.5 text-xs font-bold leading-6 text-white">{conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}</span>}
            </Link>;
          })}
        </div>
      </section>

      <section className={`min-h-0 flex-col rounded-[28px] border border-black/8 bg-[var(--surface)] p-4 dark:border-white/8 ${conversationId ? "flex" : "hidden lg:flex"}`}>
        {conversationId ? <>
          <header className="flex items-center gap-2 overflow-hidden border-b border-black/8 pb-3 pr-12 lg:pr-0 dark:border-white/8">
            <Link to="/chat" aria-label={t("Về danh sách trò chuyện")} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--soft)] lg:hidden"><ArrowLeft size={18} /></Link>
            {openFriend && <Avatar name={openFriend.displayName} src={openFriend.avatarUrl} className="size-10 shrink-0 bg-[var(--ink)] font-bold text-[var(--paper)]" />}
            <span className="min-w-0 flex-1 overflow-hidden">
              <h2 className="truncate text-lg font-bold">{openRoom ? roomTitle(openRoom) : openFriend?.displayName ?? (open?.title ? cleanChatTitle(open.title) : undefined) ?? t("Cuộc trò chuyện")}</h2>
              {openRoom?.source.kind === "mode" && <span className="block truncate text-sm text-[var(--muted)]">{t("Thảo luận mở bởi {0}", openRoom.ownerName)}</span>}
            </span>
            {open && !atTheDoor && <button id="conversation-info" type="button" aria-label={t("Tùy chọn cuộc trò chuyện")} onClick={() => setInfoOpen(true)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--soft)]">
              {open.muted ? <BellOff size={18} /> : <SlidersHorizontal size={18} />}
            </button>}
          </header>
          {open && <ConversationInfo conversation={open} open={infoOpen} onOpenChange={setInfoOpen} onJump={id => setJump({ id, token: Date.now() })} />}
          {atTheDoor ? <RoomDoor room={openRoom} />
            : <>
              {open?.kind === "room" && openRoom && <RoomBar room={openRoom} />}
              <Thread key={conversationId} conversationId={conversationId} showNames={open?.kind !== "direct"} unread={open?.unreadCount} moderator={moderator} jump={jump} closed={open?.closed ? t("Phòng đã đóng. Không viết thêm được; tin nhắn sẽ bị xóa sau 7 ngày kể từ lúc đóng.") : ""} />
            </>}
        </> : <div className="m-auto text-center text-[var(--muted)]"><MessageCircle className="mx-auto mb-2" />{t("Chọn một cuộc trò chuyện.")}</div>}
      </section>
    </div>
  );
}

/** A room the person is not in. When they may join, this is where they do; otherwise it says there is nothing here for them. */
function RoomDoor({ room }: { room: Room | undefined }) {
  const chat = useModule(chatModule);
  const navigate = useNavigate();
  const { run, pending, error } = useAction(chatKey);
  if (!room || room.removed || room.closed) return <div className="m-auto max-w-sm space-y-3 p-4 text-center text-sm leading-6">
    <p className="text-[var(--muted)]">{room?.removed ? t("Người mở phòng đã mời bạn ra khỏi phòng này.") : room?.closed ? t("Phòng này đã đóng trước khi bạn tham gia.") : t("Không mở được cuộc trò chuyện này. Có thể nó đã hết hạn, hoặc không dành cho bạn.")}</p>
    <Link to="/chat" className="font-semibold underline">{t("Về danh sách trò chuyện")}</Link>
  </div>;
  return <div className="m-auto max-w-sm space-y-3 p-4 text-center">
    <p className="truncate text-lg font-bold">{roomTitle(room)}</p>
    <p className="break-words text-sm leading-6 text-[var(--muted)]">{t("{0} mở thảo luận này. {1} người đang ở trong phòng. {2}.", room.ownerName, room.memberCount, roomTime(room, Date.now()))}</p>
    {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
    <Button disabled={pending} onClick={() => run(() => chat.joinRoom(room.id), () => navigate(`/chat/${room.id}`, { replace: true }))}>{pending ? t("Đang vào…") : t("Tham gia thảo luận")}</Button>
  </div>;
}
