import type { SupabaseClient } from "@supabase/supabase-js";
import type { Note, NoteRepository } from "../domain/Note";

export class SupabaseNoteRepository implements NoteRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(): Promise<Note[]> {
    const { data, error } = await this.db.from("personal_notes").select("id,title,body,updated_at")
      .eq("owner_id", this.userId).order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(row => ({ id: row.id, title: row.title, body: row.body, updatedAt: row.updated_at }));
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
}
