import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { Button } from "../../../shared/ui/Button";
import { chatModule } from "../chat.module";
import { messagePageSize, type ChatMessage } from "../domain/Chat";
import { chatKey } from "./useChat";

type Pages = InfiniteData<ChatMessage[], string | undefined>;

/** The messages of one conversation, oldest at the top, with the box to write a new one. */
export function Thread({ conversationId, showNames }: { conversationId: string; showNames: boolean }) {
  const chat = useModule(chatModule);
  const me = useUserId();
  const queries = useQueryClient();
  const key = [...chatKey, "messages", conversationId];
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const pages = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => chat.messages(conversationId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.length === messagePageSize ? last[last.length - 1].createdAt : undefined,
    // ponytail: the realtime "chat" event reloads this at once; the timer covers a missed event.
    refetchInterval: 5_000,
  });
  const messages = (pages.data?.pages.flat() ?? []).slice().reverse();
  const newest = messages[messages.length - 1];

  const send = useMutation({
    mutationFn: (message: ChatMessage) => chat.send(message.id, conversationId, message.body),
    onMutate: async message => {
      await queries.cancelQueries({ queryKey: key });
      queries.setQueryData<Pages>(key, data => data && { ...data, pages: [[message, ...data.pages[0]], ...data.pages.slice(1)] });
    },
    onError: (_error, message) => {
      // Take the unsent message back out and return its text to the box.
      queries.setQueryData<Pages>(key, data => data && { ...data, pages: data.pages.map(page => page.filter(item => item.id !== message.id)) });
      setText(current => current || message.body);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: chatKey }),
  });

  // Seeing the newest message marks the conversation as read.
  useEffect(() => {
    if (!newest || newest.pending || newest.senderId === me) return;
    void chat.markRead(conversationId).then(() => queries.invalidateQueries({ queryKey: [...chatKey, "conversations"] })).catch(() => undefined);
  }, [newest?.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [newest?.id]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    send.mutate({ id: crypto.randomUUID(), senderId: me, senderName: "", body, createdAt: new Date().toISOString(), pending: true });
  }

  // Enter sends with a keyboard; on a touch screen it starts a new line.
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !window.matchMedia("(pointer: coarse)").matches) { event.preventDefault(); submit(); }
  }

  return <>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-1 py-3" aria-live="polite">
      {pages.hasNextPage && <div className="text-center"><Button variant="ghost" disabled={pages.isFetchingNextPage} onClick={() => void pages.fetchNextPage()}>{pages.isFetchingNextPage ? "Đang tải…" : "Tải tin cũ hơn"}</Button></div>}
      {pages.isPending && <p role="status">Đang tải tin nhắn…</p>}
      {pages.isError && <p role="alert" className="text-sm text-[var(--danger)]">{errorMessage(pages.error, "Không tải được tin nhắn.")}</p>}
      {pages.isSuccess && messages.length === 0 && <p className="py-10 text-center text-sm text-[var(--muted)]">Chưa có tin nhắn. Viết lời chào đầu tiên.</p>}
      {messages.map(message => {
        const mine = message.senderId === me;
        return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-6 ${mine ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)]"} ${message.pending ? "opacity-60" : ""}`}>
            {showNames && !mine && <p className="text-xs font-bold">{message.senderName}</p>}
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
            <p className="text-right text-[10px] opacity-70">{message.pending ? "Đang gửi…" : new Date(message.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>;
      })}
      <div ref={bottom} />
    </div>
    {send.isError && <p role="alert" className="pb-2 text-sm text-[var(--danger)]">{errorMessage(send.error, "Chưa gửi được tin nhắn. Hãy thử lại.")}</p>}
    <form onSubmit={submit} className="flex items-end gap-2">
      <label className="sr-only" htmlFor="chat-message">Tin nhắn</label>
      <textarea id="chat-message" className="field max-h-32 min-w-0 flex-1 resize-none" rows={1} maxLength={4000} value={text} onChange={event => setText(event.target.value)} onKeyDown={onKeyDown} placeholder="Viết tin nhắn…" />
      <Button type="submit" disabled={!text.trim() || send.isPending} aria-label="Gửi tin nhắn"><Send size={17} /></Button>
    </form>
  </>;
}
