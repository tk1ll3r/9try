import type { SupabaseClient } from "@supabase/supabase-js";
import type { Note, NoteRepository, NoteShare } from "../domain/Note";

export class SupabaseNoteRepository implements NoteRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(): Promise<Note[]> {
    const { data, error } = await this.db.rpc("list_notes_for_me");
    if (error) throw error;
    return (data ?? []).map((row: any): Note => ({
      id: row.id, title: row.title, body: row.body, ownerId: row.owner_id, ownerName: row.owner_name, ownerAvatarUrl: row.owner_avatar_url ?? null,
      permission: row.permission, updatedAt: row.updated_at,
    }));
  }

  async create(title: string, body: string): Promise<void> {
    const { error } = await this.db.from("personal_notes").insert({ owner_id: this.userId, title: title.trim(), body: body.trim() });
    if (error) throw error;
  }

  async update(id: string, title: string, body: string): Promise<void> {
    const { error } = await this.db.from("personal_notes").update({ title: title.trim(), body: body.trim() })
      .eq("owner_id", this.userId).eq("id", id).select("id").single();
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("personal_notes").delete().eq("owner_id", this.userId).eq("id", id).select("id").single();
    if (error) throw error;
  }

  async shares(noteId: string): Promise<NoteShare[]> {
    const { data, error } = await this.db.rpc("list_note_shares", { p_note_id: noteId });
    if (error) throw error;
    return (data ?? []).map((row: any): NoteShare => ({
      id: row.id, targetKind: row.target_kind, targetId: row.target_id, targetName: row.target_name,
      avatarUrl: row.avatar_url ?? null, permission: row.permission,
    }));
  }

  async share(noteId: string, userIds: string[], groupIds: string[], permission: "view" | "edit"): Promise<void> {
    const { error } = await this.db.rpc("share_note", {
      p_note_id: noteId, p_user_ids: userIds, p_group_ids: groupIds, p_permission: permission,
    });
    if (error) throw error;
  }

  async revokeShare(shareId: string): Promise<void> {
    const { error } = await this.db.rpc("revoke_note_share", { p_share_id: shareId });
    if (error) throw error;
  }
}
