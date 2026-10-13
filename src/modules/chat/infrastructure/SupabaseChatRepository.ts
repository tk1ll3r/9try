import type { SupabaseClient } from "@supabase/supabase-js";
import { localize } from "../../../../supabase/functions/_shared/notificationTexts";
import { SignedFiles } from "../../../kernel/files";
import { language } from "../../../kernel/i18n";
import {
  messagePageSize, type Attachment, type ChatMessage, type ChatRepository, type Conversation, type MessageDraft, type MessageReaction, type ReadMark,
  type Room, type RoomMember, type RoomSource, type SearchHit, type TypingLine,
} from "../domain/Chat";

/** Chat through SQL functions, which check on every call that the user takes part. Photos are files in a private bucket with the same check. */
export class SupabaseChatRepository implements ChatRepository {
  private readonly files: SignedFiles;

  constructor(private readonly db: SupabaseClient, private readonly userId: string) {
    this.files = new SignedFiles(db, "chat");
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async conversations(): Promise<Conversation[]> {
    return ((await this.call("list_conversations")) ?? []).map((row: any): Conversation => ({
      // A room on a mode is named by the activity's key ("mode:coffee"), which becomes its name here.
      id: row.id, kind: row.kind, title: row.kind === "room" ? localize(row.title, language) : row.title, otherUserId: row.other_user_id ?? null, recentMessages: row.recent_messages ?? 0, lastMessageAt: row.last_message_at,
      // The server writes one line for a message without words of its own ("Đã gửi ảnh"); it is said in the reader's language.
      lastMessageBody: row.last_message_body == null ? null : localize(row.last_message_body, language), unreadCount: row.unread_count ?? 0, closed: row.closed ?? false,
      groupId: row.group_id ?? null, ownerId: row.owner_id ?? null, muted: row.muted ?? false, mutedUntil: row.muted_until ?? null,
    }));
  }

  async messages(conversationId: string, before?: string): Promise<ChatMessage[]> {
    const rows = await this.call("list_messages", { p_conversation_id: conversationId, p_before: before ?? null, p_limit: messagePageSize });
    return (rows ?? []).map((row: any): ChatMessage => {
      const quoted = row.reply_to as { id: string; sender_name: string; body: string; deleted: boolean } | null | undefined;
      return {
        id: row.id, senderId: row.sender_id, senderName: row.sender_name, createdAt: row.created_at,
        // A server that knows only text has no `has_text`: every body there is the sender's own words.
        body: row.deleted || row.has_text === false ? "" : row.body,
        replyTo: quoted ? { id: quoted.id, senderName: quoted.sender_name, body: quoted.deleted ? "" : localize(quoted.body, language), deleted: quoted.deleted } : null,
        reactions: row.reactions ?? {}, myReaction: row.my_reaction ?? null, edited: row.edited ?? false, deleted: row.deleted ?? false,
        photos: Array.isArray(row.attachments) ? row.attachments : [], card: row.ref_path ? { path: row.ref_path, title: row.ref_title ?? "" } : null,
      };
    });
  }

  async post(draft: MessageDraft): Promise<void> {
    await this.call("post_message", {
      p_id: draft.id, p_conversation_id: draft.conversationId, p_body: draft.body, p_reply_to_id: draft.replyToId ?? null,
      p_attachments: draft.photos?.length ? draft.photos : null, p_ref_path: draft.card?.path ?? null, p_ref_title: draft.card?.title ?? null,
    });
  }
  async edit(messageId: string, body: string): Promise<void> { await this.call("edit_message", { p_id: messageId, p_body: body }); }
  async unsend(message: Pick<ChatMessage, "id" | "photos">): Promise<void> {
    await this.call("delete_message", { p_id: message.id });
    await this.files.remove(message.photos.map(photo => photo.path));
  }
  async react(messageId: string, reaction: MessageReaction | null): Promise<void> { await this.call("react_to_message", { p_id: messageId, p_reaction: reaction }); }

  async reads(conversationId: string): Promise<ReadMark[]> {
    return ((await this.call("list_conversation_reads", { p_conversation_id: conversationId })) ?? []).map((row: any): ReadMark => ({
      userId: row.user_id, name: row.display_name, avatarUrl: row.avatar_url ?? null, lastReadAt: row.last_read_at ?? null,
    }));
  }
  async mute(conversationId: string, minutes: number | null): Promise<void> { await this.call("set_conversation_mute", { p_conversation_id: conversationId, p_minutes: minutes }); }
  async search(conversationId: string, query: string): Promise<SearchHit[]> {
    return ((await this.call("search_messages", { p_conversation_id: conversationId, p_query: query })) ?? []).map((row: any): SearchHit => ({
      id: row.id, senderName: row.sender_name, body: row.body, createdAt: row.created_at,
    }));
  }

  typing(conversationId: string, onTyping: (userId: string) => void): TypingLine {
    let joined = false, open = true;
    const channel = this.db.channel(`chat:${conversationId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, message => {
        const from = (message.payload as { userId?: unknown } | undefined)?.userId;
        if (typeof from === "string" && from !== this.userId) onTyping(from);
      });
    // A private topic is joined with the person's own token; the server asks whether they take part.
    void this.db.realtime.setAuth().then(() => { if (open) channel.subscribe(status => { joined = status === "SUBSCRIBED"; }); }).catch(() => undefined);
    return {
      // Before the topic is joined there is nobody to tell.
      send: () => { if (joined) void channel.send({ type: "broadcast", event: "typing", payload: { userId: this.userId } }); },
      close: () => { open = false; joined = false; void this.db.removeChannel(channel); },
    };
  }

  async uploadPhotos(conversationId: string, messageId: string, photos: readonly { blob: Blob; width: number; height: number }[]): Promise<Attachment[]> {
    const sent: Attachment[] = [];
    try {
      for (const [index, photo] of photos.entries()) {
        const path = `${conversationId}/${messageId}/${index}.jpg`;
        // The file never changes under its name, so a browser may keep it for a year.
        await this.files.put(path, photo.blob, 31_536_000);
        sent.push({ path, width: photo.width, height: photo.height });
      }
    } catch (cause) {
      await this.files.remove(sent.map(photo => photo.path));
      throw cause;
    }
    return sent;
  }
  photoAddresses(paths: readonly string[]): Promise<Map<string, string>> { return this.files.addresses(paths); }

  async markRead(conversationId: string): Promise<void> { await this.call("mark_conversation_read", { p_conversation_id: conversationId }); }
  async openDirect(userId: string): Promise<string> { return await this.call("open_direct_conversation", { p_user_id: userId }) as string; }
  async openGroup(groupId: string): Promise<string> { return await this.call("open_group_conversation", { p_group_id: groupId }) as string; }

  async rooms(filter: { conversationId?: string; source?: RoomSource } = {}): Promise<Room[]> {
    const rows = await this.call("list_rooms", {
      p_conversation_id: filter.conversationId ?? null, p_source_kind: filter.source?.kind ?? null, p_source_id: filter.source?.id ?? null, p_occurrence: filter.source?.occurrence ?? null,
    });
    return (rows ?? []).map((row: any) => ({
      id: row.id, source: { kind: row.source_kind, id: row.source_id, occurrence: row.occurrence_key || undefined }, title: localize(row.title, language),
      ownerId: row.owner_id, ownerName: row.owner_name, closesAt: row.closes_at, closed: row.closed, joined: row.joined, muted: row.muted, removed: row.removed, memberCount: row.member_count,
    }));
  }

  async openRoom(source: RoomSource, message: string): Promise<string> {
    return await this.call("open_room", { p_source_kind: source.kind, p_source_id: source.id, p_occurrence: source.occurrence ?? null, p_message: message.trim() || null }) as string;
  }
  async joinRoom(conversationId: string): Promise<void> { await this.call("join_room", { p_conversation_id: conversationId }); }
  async leaveRoom(conversationId: string): Promise<void> { await this.call("leave_room", { p_conversation_id: conversationId }); }
  async muteRoom(conversationId: string, muted: boolean): Promise<void> { await this.call("mute_room", { p_conversation_id: conversationId, p_muted: muted }); }
  async closeRoom(conversationId: string): Promise<void> { await this.call("close_room", { p_conversation_id: conversationId }); }
  async removeRoomMember(conversationId: string, userId: string): Promise<void> { await this.call("remove_room_member", { p_conversation_id: conversationId, p_user_id: userId }); }

  async roomMembers(conversationId: string): Promise<RoomMember[]> {
    const rows = await this.call("list_room_members", { p_conversation_id: conversationId });
    return (rows ?? []).map((row: any) => ({ userId: row.user_id, displayName: row.display_name, avatarUrl: row.avatar_url, isOwner: row.is_owner }));
  }
}
