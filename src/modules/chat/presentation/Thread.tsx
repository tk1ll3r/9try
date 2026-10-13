import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { dayTitle, localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { warmImages } from "../../../kernel/warmImages";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { chatModule } from "../chat.module";
import { canEdit, canUnsend, layoutThread, messagePageSize, readBy, type ChatMessage, type TypingLine } from "../domain/Chat";
import { Composer, type Outgoing } from "./Composer";
import { MessageBubble } from "./MessageBubble";
import type { MessageActions } from "./MessageMenu";
import { chatKey } from "./useChat";
import { t } from "../../../kernel/i18n";

type Pages = InfiniteData<ChatMessage[], string | undefined>;
const noPhotos = new Map<string, string>();
const dayOf = (instant: string) => localDateKey(new Date(instant));
/** "Hôm nay", "Hôm qua", or the day by its name. */
function dayLabel(day: string): string {
  const now = new Date();
  if (day === localDateKey(now)) return t("Hôm nay");
  return day === localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)) ? t("Hôm qua") : dayTitle(day);
}

/**
 * The messages of one conversation, oldest at the top, with the box to write a new one.
 * - `closed` is what to say in place of the box when the conversation takes nothing new, as a closed room.
 * - `unread` is how many messages were unread when the conversation was opened: a line stands before them.
 * - `moderator`: the reader may take back anyone's message (a group's owner or admin, a room's owner).
 * - `jump` asks the thread to go to a message, as a search result does. A new `token` asks again.
 */
export function Thread({ conversationId, showNames, closed = "", unread, moderator = false, jump }: {
  conversationId: string; showNames: boolean; closed?: string; unread?: number; moderator?: boolean; jump?: { id: string; token: number } | null;
}) {
  const chat = useModule(chatModule);
  const me = useUserId();
  const queries = useQueryClient();
  const confirm = useConfirm();
  const key = [...chatKey, "messages", conversationId];
  const act = useAction(chatKey);
  const list = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const [away, setAway] = useState(0);
  const [far, setFar] = useState(false);
  const [replying, setReplying] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [lit, setLit] = useState("");
  const [restore, setRestore] = useState<(Outgoing & { token: number }) | null>(null);
  const [typers, setTypers] = useState<Record<string, number>>({});
  const line = useRef<TypingLine | null>(null);
  // The count is taken once, the first time it is known: reading the thread then brings it to zero.
  const unreadAtOpen = useRef<number | null>(null);
  if (unreadAtOpen.current === null && unread !== undefined) unreadAtOpen.current = unread;

  const pages = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => chat.messages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.length === messagePageSize ? last[last.length - 1].createdAt : undefined,
    // The realtime "chat" event reloads this at once. The timer only covers an event that was missed.
    refetchInterval: 60_000,
  });
  const messages = (pages.data?.pages.flat() ?? []).slice().reverse();
  const newest = messages[messages.length - 1];
  // A server that does not know who read what simply shows no "Đã xem".
  const reads = useQuery({ queryKey: [...chatKey, "reads", conversationId], queryFn: () => chat.reads(conversationId).catch(() => []), refetchInterval: 120_000, staleTime: 60_000 });
  const paths = messages.flatMap(message => message.photos.map(photo => photo.path));
  const addresses = useQuery({
    queryKey: [...chatKey, "photos", conversationId, paths.join()], queryFn: () => chat.photoAddresses(paths), enabled: paths.length > 0,
    staleTime: 40 * 60_000, placeholderData: keepPreviousData,
  }).data ?? noPhotos;
  // The newest photos are the ones on screen when a chat opens. Start those files before the scroll settles.
  const recentPhotos = paths.slice(-6).map(path => addresses.get(path) ?? "").join("\n");
  useEffect(() => { warmImages(recentPhotos.split("\n")); }, [recentPhotos]);

  // The line the people of the conversation tell each other on that they are writing. A name stays for five seconds.
  useEffect(() => {
    const opened = chat.typing(conversationId, userId => setTypers(current => ({ ...current, [userId]: Date.now() + 5_000 })));
    line.current = opened;
    const sweep = window.setInterval(() => setTypers(current => {
      const kept = Object.fromEntries(Object.entries(current).filter(([, until]) => until > Date.now()));
      return Object.keys(kept).length === Object.keys(current).length ? current : kept;
    }), 1_000);
    return () => { opened.close(); line.current = null; window.clearInterval(sweep); };
  }, [conversationId]);
  const writing = Object.keys(typers).flatMap(id => reads.data?.find(mark => mark.userId === id)?.name ?? []);

  const send = useMutation({
    mutationFn: async ({ message, out }: { message: ChatMessage; out: Outgoing }) => {
      const photos = out.photos.length ? await chat.uploadPhotos(conversationId, message.id, out.photos) : [];
      await chat.post({ id: message.id, conversationId, body: message.body, replyToId: message.replyTo?.id ?? null, photos, card: message.card });
    },
    onMutate: async ({ message }) => {
      await queries.cancelQueries({ queryKey: key });
      queries.setQueryData<Pages>(key, data => data && { ...data, pages: [[message, ...data.pages[0]], ...data.pages.slice(1)] });
    },
    onError: (_error, { message, out }) => {
      // Take the unsent message back out and return its words, its photos and its card to the box.
      queries.setQueryData<Pages>(key, data => data && { ...data, pages: data.pages.map(page => page.filter(item => item.id !== message.id)) });
      setRestore({ ...out, token: Date.now() });
    },
    onSettled: (_data, error, { out }) => {
      // The pictures of a message that went out are let go. Those of one that did not are back in the box.
      if (!error) for (const photo of out.photos) URL.revokeObjectURL(photo.preview);
      return Promise.all([
        queries.invalidateQueries({ queryKey: [...chatKey, "conversations"] }),
        queries.invalidateQueries({ queryKey: [...chatKey, "messages"] }),
        queries.invalidateQueries({ queryKey: [...chatKey, "reads"] }),
      ]);
    },
  });

  // Seeing the newest message marks the conversation as read. A thread left open in a tab nobody is
  // looking at has not been seen: the sender reads "Đã xem" only once the page is on screen again.
  useEffect(() => {
    if (!newest || newest.pending || newest.senderId === me) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", mark);
      void chat.markRead(conversationId).then(() => queries.invalidateQueries({ queryKey: [...chatKey, "conversations"] })).catch(() => undefined);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [newest?.id]);

  const toEnd = () => { const box = list.current; if (box) box.scrollTop = box.scrollHeight; atEnd.current = true; setAway(0); setFar(false); };
  // A new message brings the thread to its end for someone who is there, or who wrote it. Someone reading further up is told that it arrived.
  const opened = useRef(false);
  useEffect(() => {
    if (!newest) return;
    if (!opened.current) {
      opened.current = true;
      const mark = document.getElementById("unread-line");
      if (mark) { mark.scrollIntoView({ block: "center" }); return; }
      toEnd(); return;
    }
    if (atEnd.current || newest.senderId === me) toEnd(); else setAway(count => count + 1);
  }, [newest?.id]);
  function onScroll() {
    const box = list.current;
    if (!box) return;
    const left = box.scrollHeight - box.scrollTop - box.clientHeight;
    atEnd.current = left < 120;
    setFar(left > 400);
    if (atEnd.current && away) setAway(0);
  }

  /** Goes to a message and lights it for a moment. One that is further back than what is loaded is fetched first, ten pages at most. */
  async function goTo(messageId: string) {
    for (let page = 0; page < 10 && !document.getElementById(`msg-${messageId}`); page++) {
      const more = await pages.fetchNextPage();
      if (!more.hasNextPage) break;
    }
    requestAnimationFrame(() => {
      const found = document.getElementById(`msg-${messageId}`);
      if (!found) return;
      found.scrollIntoView({ block: "center" });
      setLit(messageId);
      window.setTimeout(() => setLit(current => current === messageId ? "" : current), 1_600);
    });
  }
  useEffect(() => { if (jump) void goTo(jump.id); }, [jump?.token]);

  function post(out: Outgoing) {
    const message: ChatMessage = {
      id: crypto.randomUUID(), senderId: me, senderName: "", body: out.body, createdAt: new Date().toISOString(), pending: true, uploading: out.photos.length || undefined,
      replyTo: replying ? { id: replying.id, senderName: replying.senderName, body: replying.body, deleted: false } : null,
      reactions: {}, myReaction: null, edited: false, deleted: false, photos: [], card: out.card,
    };
    setReplying(null);
    send.mutate({ message, out });
  }
  const actionsOf = (message: ChatMessage): MessageActions | undefined => closed || message.pending || message.deleted ? undefined : {
    react: reaction => act.run(() => chat.react(message.id, reaction)),
    reply: () => { setEditing(null); setReplying(message); },
    copy: message.body ? () => void navigator.clipboard?.writeText(message.body).catch(() => undefined) : undefined,
    edit: canEdit(message, me, Date.now()) ? () => { setReplying(null); setEditing(message); } : undefined,
    unsend: canUnsend(message, me, moderator) ? async () => {
      if (await confirm({ title: t("Thu hồi tin nhắn?"), body: t("Tin nhắn biến mất với mọi người trong cuộc trò chuyện. Việc này không hoàn tác được."), action: t("Thu hồi tin nhắn") })) act.run(() => chat.unsend(message));
    } : undefined,
  };

  const items = layoutThread(messages, me, unreadAtOpen.current ?? 0, dayOf);
  // Under one's own newest message: who has read that far.
  const mineLast = [...messages].reverse().find(message => message.senderId === me && !message.pending && !message.deleted);
  const seen = mineLast ? readBy(reads.data ?? [], mineLast) : [];
  const seenLine = seen.length > 0 && <p aria-label={showNames ? t("Đã xem: {0}", seen.map(mark => mark.name).join(", ")) : undefined} className="mt-0.5 flex items-center justify-end gap-1 pr-1 text-[11px] text-[var(--muted)]">
    {showNames ? <>{seen.slice(0, 5).map(mark => <Avatar key={mark.userId} name={mark.name} src={mark.avatarUrl} className="size-4 bg-[var(--soft)] text-[8px] font-black" />)}{seen.length > 5 && <span>+{seen.length - 5}</span>}</> : t("Đã xem")}
  </p>;

  return <>
    <div className="relative min-h-0 flex-1" data-thread>
      <div ref={list} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden px-1 py-3" aria-live="polite">
        {pages.hasNextPage && <div className="text-center"><Button variant="ghost" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>{pages.isFetchingNextPage ? t("Đang tải…") : t("Tải tin cũ hơn")}</Button></div>}
        {pages.isPending && <p role="status">{t("Đang tải tin nhắn…")}</p>}
        {pages.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(pages.error, t("Không tải được tin nhắn."))}</p>}
        {pages.isSuccess && messages.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">{t("Chưa có tin nhắn. Viết lời chào đầu tiên.")}</p>}
        {items.map(item => item.kind === "day" ? <p key={item.key} className="my-3 text-center text-[11px] font-semibold text-[var(--muted)]"><span className="rounded-full bg-[var(--soft)] px-3 py-1">{dayLabel(item.day)}</span></p>
          : item.kind === "unread" ? <p key={item.key} id="unread-line" className="my-3 flex items-center gap-3 text-[11px] font-bold text-[var(--focus)] before:h-px before:flex-1 before:bg-[var(--lime-strong)] after:h-px after:flex-1 after:bg-[var(--lime-strong)]">{t("Chưa đọc từ đây")}</p>
          : <MessageBubble key={item.key} message={item.message} mine={item.message.senderId === me} showName={showNames} first={item.first} last={item.last} addresses={addresses}
            lit={lit === item.message.id} actions={actionsOf(item.message)} onJump={id => void goTo(id)} below={item.message.id === mineLast?.id ? seenLine : undefined} />)}
        {writing.length > 0 && <p role="status" className="mt-2 px-2 text-xs italic text-[var(--muted)]">{writing.length === 1 ? t("{0} đang nhập…", writing[0]) : t("{0} người đang nhập…", writing.length)}</p>}
      </div>
      {(far || away > 0) && <button type="button" onClick={toEnd} aria-label={away ? t("{0} tin mới, tới tin mới nhất", away) : t("Tới tin mới nhất")}
        className="animate-pop absolute bottom-3 right-3 inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[var(--ink)] px-3 text-sm font-semibold text-[var(--paper)] shadow-lg">
        <ArrowDown size={16} />{away > 0 && away}
      </button>}
    </div>
    {(send.isError || act.error) && <p role="alert" className="pb-2 text-sm text-[var(--danger)]">{send.isError ? errorMessage(send.error, t("Chưa gửi được tin nhắn. Hãy thử lại.")) : act.error}</p>}
    {closed ? <p role="status" className="rounded-2xl bg-[var(--soft)] p-3 text-sm leading-6 text-[var(--muted)]">{closed}</p>
      : <Composer conversationId={conversationId} replying={replying} onCancelReply={() => setReplying(null)} editing={editing} onCancelEdit={() => setEditing(null)}
        onSend={post} onEdit={(id, body) => act.run(() => chat.edit(id, body), () => setEditing(null))} onTyping={() => line.current?.send()} busy={act.pending} restore={restore} />}
  </>;
}
