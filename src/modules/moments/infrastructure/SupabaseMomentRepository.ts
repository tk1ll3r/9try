import type { SupabaseClient } from "@supabase/supabase-js";
import { SignedFiles } from "../../../kernel/files";
import type { ArchivedMoment, Moment, MomentArchiveCursor, MomentArchivePage, MomentDraft, MomentRepository, MomentViewer, Reaction } from "../domain/Moment";

/**
 * Photos in Supabase: the rows through SQL functions that ask on every call who may see what, the
 * files through a private bucket whose rule asks the same about the row that names the file.
 */
export class SupabaseMomentRepository implements MomentRepository {
  private readonly files: SignedFiles;

  constructor(private readonly db: SupabaseClient, private readonly userId: string) {
    this.files = new SignedFiles(db, "moments");
  }

  private async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw error;
    return data;
  }

  async list(): Promise<Moment[]> {
    return ((await this.call("list_moments")) ?? []).map((row: any): Moment => ({
      id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, ownerAvatarUrl: row.owner_avatar_url ?? null, path: row.path, mode: row.mode ?? null,
      modeLabel: row.mode_label ?? null, modeIcon: row.mode_icon ?? null, modeColor: row.mode_color ?? null,
      caption: row.caption ?? "", width: row.width, height: row.height, createdAt: row.created_at, expiresAt: row.expires_at, audience: row.audience,
      mine: row.owner_id === this.userId, seen: row.seen, myReaction: row.my_reaction ?? null, views: row.views ?? 0, reactions: row.reactions ?? {},
    }));
  }

  async archive(before?: MomentArchiveCursor): Promise<MomentArchivePage> {
    const limit = 30;
    const rows = (await this.call("list_moment_archive", {
      p_before_created_at: before?.createdAt ?? null,
      p_before_id: before?.id ?? null,
      p_limit: limit,
    })) ?? [];
    const items: ArchivedMoment[] = rows.map((row: any): ArchivedMoment => ({
      id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, ownerAvatarUrl: row.owner_avatar_url ?? null,
      path: row.path, mode: row.mode ?? null, modeLabel: row.mode_label ?? null, modeIcon: row.mode_icon ?? null,
      modeColor: row.mode_color ?? null, caption: row.caption ?? "", width: row.width, height: row.height,
      createdAt: row.created_at, audience: row.audience, mine: row.owner_id === this.userId,
    }));
    const last = items.at(-1);
    return { items, next: items.length === limit && last ? { createdAt: last.createdAt, id: last.id } : null };
  }

  addresses(paths: readonly string[]): Promise<Map<string, string>> { return this.files.addresses(paths); }

  async download(path: string): Promise<Blob> {
    const { data, error } = await this.db.storage.from("moments").download(path);
    if (error) throw error;
    return data;
  }

  async post(draft: MomentDraft): Promise<void> {
    const id = crypto.randomUUID();
    const path = `${this.userId}/${id}.jpg`;
    await this.files.put(path, draft.blob, 86_400);
    try {
      await this.call("post_moment", {
        p_id: id, p_width: draft.width, p_height: draft.height, p_mode: draft.mode, p_caption: draft.caption,
        p_viewer_ids: draft.viewerIds, p_activate_mode: draft.activateMode, p_mode_minutes: draft.modeMinutes,
      });
    } catch (cause) {
      // The server refused the photo: its file, which nobody else can read, is taken back at once.
      // When no answer came the photo may be posted all the same, so the file stays; if it is not,
      // the server's worker removes it within the hour.
      if ((cause as { code?: string } | null)?.code) await this.files.remove([path]);
      throw cause;
    }
  }

  async see(id: string): Promise<void> { await this.call("see_moment", { p_id: id }); }
  async react(id: string, reaction: Reaction | null): Promise<void> { await this.call("react_to_moment", { p_id: id, p_reaction: reaction }); }

  async remove(id: string): Promise<void> {
    await this.files.remove([await this.call("delete_moment", { p_id: id }) as string]);
  }

  async viewers(id: string): Promise<MomentViewer[]> {
    return ((await this.call("list_moment_views", { p_id: id })) ?? []).map((row: any): MomentViewer => ({
      userId: row.user_id, name: row.display_name, avatarUrl: row.avatar_url ?? null, seenAt: row.seen_at, reaction: row.reaction ?? null,
    }));
  }

  async streakBadges(): Promise<Map<string, number>> {
    const rows = (await this.call("list_moment_streak_badges")) ?? [];
    return new Map(rows.map((row: any) => [row.user_id, Number(row.streak_days)]));
  }
}
