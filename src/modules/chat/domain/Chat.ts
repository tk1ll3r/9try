import type { FriendSignal } from "../../../kernel/module";
import { t } from "../../../kernel/i18n";
import { activityNames } from "../../../../supabase/functions/_shared/notificationTexts";

export interface Conversation {
  id: string;
  /** A room is a temporary conversation on an event, a meetup or an activity mode. */
  kind: "direct" | "group" | "room";
  /** The other person's name, the group's name, or what the room is about. */
  title: string;
  /** The other person in a direct conversation. */
  otherUserId: string | null;
  /** Messages of the last 14 days. 0 on a database that does not count them yet. */
  recentMessages: number;
  lastMessageAt: string | null;
  lastMessageBody: string | null;
  unreadCount: number;
  /** For a room: it takes no new message. Always false for the other kinds. */
  closed: boolean;
  /** The group of a group conversation. */
  groupId: string | null;
  /** The person who opened a room. */
  ownerId: string | null;
  /** New messages here are not told to the person. `mutedUntil` is when that ends by itself; "infinity" is never. */
  muted: boolean;
  mutedUntil: string | null;
}

/** What a room belongs to. `occurrence` names one time of a repeating event, "YYYY-MM-DD". */
export interface RoomSource {
  kind: "event" | "meetup" | "mode";
  /** The event, the meetup, or for a mode the person whose mode it is. */
  id: string;
  occurrence?: string;
}

/**
 * A temporary conversation that the signed-in user is in or may join. It closes by the clock, a day
 * after its event or meetup ends or when its mode ends, and can then be read for seven more days.
 */
export interface Room {
  id: string;
  source: RoomSource;
  /** The name of the event or meetup, or of the activity. */
  title: string;
  ownerId: string;
  ownerName: string;
  closesAt: string;
  closed: boolean;
  joined: boolean;
  muted: boolean;
  /** The owner took this person out; they cannot join again. */
  removed: boolean;
  memberCount: number;
}

export interface RoomMember {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
}

export const cleanChatTitle = (title: string): string => {
  if (title.startsWith("mode:")) {
    const key = title.slice(5);
    return activityNames[key]?.[0] ?? t("Đang làm việc khác");
  }
  return title;
};

/** Keep a mode room's title short; the owner's name is shown on its secondary line. */
export const roomTitle = (room: Pick<Room, "title">) => cleanChatTitle(room.title);

/** The screen that shows what a room is about. */
export function roomSourcePath(room: Pick<Room, "source" | "ownerId">, userId: string): string {
  if (room.source.kind === "meetup") return `/meetups/${room.source.id}`;
  if (room.source.kind === "mode") return "/";
  return room.ownerId === userId ? "/calendar" : `/calendar/shared/${room.ownerId}`;
}

export type MessageReaction = "heart" | "laugh" | "wow" | "sad" | "angry" | "like";
/** The six reactions in the order they are offered, each with the sign a person sees. */
export const messageReactions: readonly (readonly [MessageReaction, string])[] = [["heart", "❤️"], ["laugh", "😂"], ["wow", "😮"], ["sad", "😢"], ["angry", "😡"], ["like", "👍"]];
export const reactionSign = (reaction: string) => messageReactions.find(([key]) => key === reaction)?.[1] ?? "";

/** A photo of a message: a file in the chat bucket, with its size so the thread can keep room for it. */
export interface Attachment {
  path: string;
  width: number;
  height: number;
}
/** Something inside the app that a message points to: a meetup, a friend's calendar, the map. */
export interface MessageCard {
  path: string;
  title: string;
}
/** A line of the message that another one answers. */
export interface Quote {
  id: string;
  senderName: string;
  body: string;
  deleted: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  /** The sender's own words. Empty for a message that is only photos or a card, and for one that was taken back. */
  body: string;
  createdAt: string;
  replyTo: Quote | null;
  reactions: Partial<Record<MessageReaction, number>>;
  myReaction: MessageReaction | null;
  edited: boolean;
  /** Taken back by its sender, or by whoever looks after the group or the room. */
  deleted: boolean;
  photos: Attachment[];
  card: MessageCard | null;
  /** Shown already, but the server has not confirmed it yet. */
  pending?: boolean;
  /** How many photos are still on their way with a message that is shown already. */
  uploading?: number;
}

/** What is sent. `id` is made by the caller, so sending again after a lost reply cannot post twice. */
export interface MessageDraft {
  id: string;
  conversationId: string;
  body: string;
  replyToId?: string | null;
  photos?: Attachment[];
  card?: MessageCard | null;
}

/** How far another person of the conversation has read. */
export interface ReadMark {
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastReadAt: string | null;
}

export interface SearchHit {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/** The line over which the people of a conversation tell each other that they are writing. Nothing of it is stored. */
export interface TypingLine {
  /** Says "I am writing" to the others. */
  send(): void;
  close(): void;
}

export const messagePageSize = 50;
/** A message can be changed for this long after it was sent. The server holds the same limit. */
export const editWindowMs = 15 * 60_000;
/** A photo is redrawn to this before it leaves the device. */
export const chatPhotoLimits = { maxSide: 1280, maxBytes: 300_000 } as const;
export const maxPhotos = 6;

/** One's own text, not taken back, not older than the 15 minutes. A message of photos or a card is sent again instead. */
export function canEdit(message: ChatMessage, me: string, now: number): boolean {
  return message.senderId === me && !message.deleted && !message.pending && !message.photos.length && !message.card && now - Date.parse(message.createdAt) < editWindowMs;
}
/** One's own message at any time. `moderator` is the owner or an admin of the group, or the owner of the room. */
export const canUnsend = (message: ChatMessage, me: string, moderator: boolean) => !message.deleted && !message.pending && (message.senderId === me || moderator);

export type ThreadItem =
  | { kind: "day"; key: string; day: string }
  | { kind: "unread"; key: string }
  /** `first` and `last` say where the message stands in a run of messages by one person. */
  | { kind: "message"; key: string; message: ChatMessage; first: boolean; last: boolean };

/** Messages by one person less than this apart read as one run: one name above, one time below. */
const runGapMs = 5 * 60_000;

/**
 * What a thread shows, top to bottom, for `messages` in the order they were sent: a line for each
 * new day, a line before the first of the `unread` newest messages by other people, and the messages
 * in runs. `dayOf` gives the reader's own calendar day of a moment.
 */
export function layoutThread(messages: readonly ChatMessage[], me: string, unread: number, dayOf: (instant: string) => string): ThreadItem[] {
  let firstUnread = -1;
  for (let index = messages.length - 1, left = unread; index >= 0 && left > 0; index--) {
    if (messages[index].senderId !== me) { left--; firstUnread = index; }
  }
  const joined = (a: ChatMessage, b: ChatMessage) => a.senderId === b.senderId && dayOf(a.createdAt) === dayOf(b.createdAt)
    && Date.parse(b.createdAt) - Date.parse(a.createdAt) < runGapMs;
  const items: ThreadItem[] = [];
  messages.forEach((message, index) => {
    const before = messages[index - 1], after = messages[index + 1];
    const day = dayOf(message.createdAt);
    if (!before || dayOf(before.createdAt) !== day) items.push({ kind: "day", key: `day-${day}`, day });
    if (index === firstUnread) items.push({ kind: "unread", key: "unread" });
    items.push({
      kind: "message", key: message.id, message,
      first: !before || index === firstUnread || !joined(before, message),
      last: !after || index + 1 === firstUnread || !joined(message, after),
    });
  });
  return items;
}

/** The people who have read as far as `message`, for the line under it. */
export const readBy = (marks: readonly ReadMark[], message: Pick<ChatMessage, "createdAt">) => marks.filter(mark => mark.lastReadAt !== null && mark.lastReadAt >= message.createdAt);

/** The signed-in user's conversations. */
export interface ChatRepository {
  conversations(): Promise<Conversation[]>;
  /** One page of messages, newest first, older than `before` when given. */
  messages(conversationId: string, before?: string): Promise<ChatMessage[]>;
  post(draft: MessageDraft): Promise<void>;
  /** Changes one's own text. The server allows it for 15 minutes. */
  edit(messageId: string, body: string): Promise<void>;
  /** Takes a message back for everyone, and removes its photos. */
  unsend(message: Pick<ChatMessage, "id" | "photos">): Promise<void>;
  /** One reaction per person per message; null takes it back. */
  react(messageId: string, reaction: MessageReaction | null): Promise<void>;
  /** How far the other people of the conversation have read. */
  reads(conversationId: string): Promise<ReadMark[]>;
  /** `minutes` null turns notifications back on, 0 mutes until that is done, any other number mutes for that long. */
  mute(conversationId: string, minutes: number | null): Promise<void>;
  search(conversationId: string, query: string): Promise<SearchHit[]>;
  /** Joins the conversation's typing line. `onTyping` is told the id of each other person who is writing. */
  typing(conversationId: string, onTyping: (userId: string) => void): TypingLine;
  /** Puts photos into the bucket for a message that is about to be sent, and resolves with what the message then names. */
  uploadPhotos(conversationId: string, messageId: string, photos: readonly { blob: Blob; width: number; height: number }[]): Promise<Attachment[]>;
  /** Where the photos can be loaded from for the next hour, by the name of the file. */
  photoAddresses(paths: readonly string[]): Promise<Map<string, string>>;
  markRead(conversationId: string): Promise<void>;
  /** The id of the conversation with a friend, created on first use. */
  openDirect(userId: string): Promise<string>;
  openGroup(groupId: string): Promise<string>;
  /** The rooms the user is in or may join. With a filter: the room with that id, or the room of that thing. */
  rooms(filter?: { conversationId?: string; source?: RoomSource }): Promise<Room[]>;
  /** Turns the discussion on for something the user owns, with an optional first message. Resolves with the room's id. */
  openRoom(source: RoomSource, message: string): Promise<string>;
  joinRoom(conversationId: string): Promise<void>;
  leaveRoom(conversationId: string): Promise<void>;
  muteRoom(conversationId: string, muted: boolean): Promise<void>;
  /** For the owner: no new messages from now on. The room can be read for seven more days. */
  closeRoom(conversationId: string): Promise<void>;
  /** For the owner: takes someone out for good. */
  removeRoomMember(conversationId: string, userId: string): Promise<void>;
  roomMembers(conversationId: string): Promise<RoomMember[]>;
}

const day = 86_400_000;

/**
 * What direct conversations say about friends: unread messages, and how much and how lately two people talk.
 * Sixty messages in two weeks count as "talks a lot"; a last message older than a week no longer counts as recent.
 */
export function chatSignals(conversations: readonly Conversation[], now: Date, rooms: readonly Room[] = []): FriendSignal[] {
  // A friend who opened a discussion on their mode: the Mode screen shows it on their card, and a tap joins.
  const discussing: FriendSignal[] = rooms.filter(room => room.source.kind === "mode" && !room.closed && !room.removed)
    .map(room => ({ userId: room.ownerId, kind: "room", strength: 1, label: room.joined ? t("Đang thảo luận cùng bạn") : t("Đang mở thảo luận"), to: `/chat/${room.id}` }));
  return [...discussing, ...conversations.flatMap(conversation => {
    if (conversation.kind !== "direct" || !conversation.otherUserId) return [];
    const userId = conversation.otherUserId, to = `/chat/${conversation.id}`;
    const signals: FriendSignal[] = [];
    if (conversation.unreadCount > 0) {
      signals.push({ userId, kind: "unread", strength: Math.min(conversation.unreadCount, 5) / 5, label: t("{0} tin chưa đọc", conversation.unreadCount), to });
    }
    const age = conversation.lastMessageAt ? now.getTime() - Date.parse(conversation.lastMessageAt) : Infinity;
    const recency = age < day ? 1 : Math.max(0, 1 - (age - day) / (6 * day));
    const volume = Math.min(1, Math.log2(1 + conversation.recentMessages) / Math.log2(61));
    const strength = 0.7 * volume + 0.3 * recency;
    if (strength > 0) {
      const label = conversation.recentMessages >= 20 ? t("Hay trò chuyện") : age < day ? t("Nhắn hôm nay") : age < 2 * day ? t("Nhắn hôm qua") : undefined;
      signals.push({ userId, kind: "chat", strength, label, to });
    }
    return signals;
  })];
}
