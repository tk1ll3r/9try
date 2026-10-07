import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateKeyInTimeZone, Habit, streakCap, type HabitRepeat, type HabitRepository } from "../domain/Habit";

/** A habit is a row of `personal_tasks` that repeats; each time it is done is a row of `routine_completions`. */
export class SupabaseHabitRepository implements HabitRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(): Promise<Habit[]> {
    const { data: rows, error } = await this.db.from("personal_tasks").select("id,title,recurrence")
      .eq("owner_id", this.userId).in("recurrence", ["daily", "weekly"]).order("created_at", { ascending: false });
    if (error) throw error;
    if (!rows?.length) return [];

    // The server records a completion on the profile's calendar day, not the device's.
    const { data: profile, error: profileError } = await this.db.from("profiles").select("timezone").eq("id", this.userId).single();
    if (profileError) throw profileError;
    const today = dateKeyInTimeZone(profile?.timezone || "UTC");
    // ponytail: one request returns the newest 1000 completions, enough for 11 habits done every day
    // of the window. Count streaks in SQL if someone tracks more.
    const { data: completions, error: completionError } = await this.db.from("routine_completions").select("task_id,completion_date")
      .in("task_id", rows.map(row => row.id)).gte("completion_date", addDays(today, -streakCap.daily)).lte("completion_date", today)
      .order("completion_date", { ascending: false });
    if (completionError) throw completionError;

    return rows.map(row => new Habit(row.id, row.title, row.recurrence as HabitRepeat,
      (completions ?? []).filter(item => item.task_id === row.id).map(item => item.completion_date), today));
  }

  async create(title: string, repeat: HabitRepeat): Promise<void> {
    const { error } = await this.db.from("personal_tasks").insert({ owner_id: this.userId, title: title.trim(), priority: "medium", recurrence: repeat });
    if (error) throw error;
  }

  async markDone(id: string): Promise<void> {
    const { error } = await this.db.rpc("complete_routine", { p_task_id: id });
    if (error) throw error;
  }

  async undoDone(id: string): Promise<void> {
    const { error } = await this.db.rpc("undo_routine_completion", { p_task_id: id });
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from("personal_tasks").delete().eq("owner_id", this.userId).eq("id", id).select("id").single();
    if (error) throw error;
  }
}
