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
  completedToday: boolean;
}

function localDateKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(new Date());
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
    const db = requireSupabase();
    const { data: tasks, error: taskError } = await db
      .from("personal_tasks")
      .select("id,title,recurrence")
      .eq("owner_id", userId)
      .in("recurrence", ["daily", "weekly"])
      .order("created_at", { ascending: false });
    if (taskError) throw taskError;

    const ids = (tasks ?? []).map((task) => task.id);
    if (ids.length === 0) return [];

    const { data: completions, error: completionError } = await db
      .from("routine_completions")
      .select("task_id")
      .in("task_id", ids)
      .eq("completion_date", localDateKey());
    if (completionError) throw completionError;

    const done = new Set((completions ?? []).map((row) => row.task_id));
    return (tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      recurrence: task.recurrence as "daily" | "weekly",
      completedToday: done.has(task.id),
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
    const { error } = await requireSupabase().rpc("complete_routine", { p_task_id: id });
    if (error) throw error;
  }

  async scheduleReminder(input: { dueAt: Date; title: string; body: string }): Promise<void> {
    const { error } = await requireSupabase().rpc("schedule_personal_reminder", {
      p_due_at: input.dueAt.toISOString(),
      p_title: input.title.trim(),
      p_body: input.body.trim(),
      p_action_path: "/me/organizer",
    });
    if (error) throw error;
  }
}

export const organizerData = new OrganizerData();
