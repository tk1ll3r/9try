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
  completedInPeriod: boolean;
}

export function dateKeyInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone,
  }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function mondayOfWeek(dayKey: string): string {
  const day = new Date(`${dayKey}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
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

  async updateNote(userId: string, id: string, title: string, body: string): Promise<void> {
    const { error } = await requireSupabase().from("personal_notes")
      .update({ title: title.trim(), body: body.trim() })
      .eq("owner_id", userId).eq("id", id).select("id").single();
    if (error) throw error;
  }

  async deleteNote(userId: string, id: string): Promise<void> {
    const { error } = await requireSupabase().from("personal_notes").delete()
      .eq("owner_id", userId).eq("id", id).select("id").single();
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

    // The RPC records the profile's calendar day, not the browser's timezone day.
    const { data: profile, error: profileError } = await db.from("profiles")
      .select("timezone").eq("id", userId).single();
    if (profileError) throw profileError;
    const today = dateKeyInTimeZone(profile?.timezone || "UTC");
    const monday = mondayOfWeek(today);
    const { data: completions, error: completionError } = await db
      .from("routine_completions")
      .select("task_id,completion_date")
      .in("task_id", ids)
      .gte("completion_date", monday)
      .lte("completion_date", today);
    if (completionError) throw completionError;

    const todayDone = new Set((completions ?? []).filter(row => row.completion_date === today).map(row => row.task_id));
    const weekDone = new Set((completions ?? []).map(row => row.task_id));
    return (tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      recurrence: task.recurrence as "daily" | "weekly",
      completedInPeriod: task.recurrence === "weekly" ? weekDone.has(task.id) : todayDone.has(task.id),
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
