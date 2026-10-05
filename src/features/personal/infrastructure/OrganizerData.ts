import { requireSupabase } from "../../../shared/infrastructure/supabase";

export interface PersonalNote {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

export interface RoutineTask {
  id: string;
  title: string;
  recurrence: "daily" | "weekly";
  completedAt: string | null;
  dueAt: string | null;
}

export class OrganizerData {
  async listNotes(userId: string): Promise<PersonalNote[]> {
    const { data, error } = await requireSupabase()
      .from("personal_notes")
      .select("id,title,body,updated_at")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      updatedAt: row.updated_at,
    }));
  }

  async createNote(userId: string, title: string, body: string): Promise<void> {
    const { error } = await requireSupabase().from("personal_notes").insert({
      owner_id: userId,
      title: title.trim(),
      body: body.trim(),
    });
    if (error) throw error;
  }

  async deleteNote(id: string): Promise<void> {
    const { error } = await requireSupabase().from("personal_notes").delete().eq("id", id);
    if (error) throw error;
  }

  async listRoutines(userId: string): Promise<RoutineTask[]> {
    const { data, error } = await requireSupabase()
      .from("personal_tasks")
      .select("id,title,recurrence,completed_at,due_at")
      .eq("owner_id", userId)
      .in("recurrence", ["daily", "weekly"])
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      recurrence: row.recurrence,
      completedAt: row.completed_at,
      dueAt: row.due_at,
    }));
  }

  async createRoutine(userId: string, title: string, recurrence: "daily" | "weekly"): Promise<void> {
    const { error } = await requireSupabase().from("personal_tasks").insert({
      owner_id: userId,
      title: title.trim(),
      priority: "medium",
      recurrence,
    });
    if (error) throw error;
  }

  async markRoutineDone(id: string): Promise<void> {
    const { error } = await requireSupabase()
      .from("personal_tasks")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }
}

export const organizerData = new OrganizerData();
