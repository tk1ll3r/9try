import type { SupabaseClient } from "@supabase/supabase-js";
import { DomainError } from "../../../kernel/errors";
import { Task, type TaskDetails, type TaskPriority } from "../domain/Task";
import type { TaskRepository } from "../domain/TaskRepository";

const columns = "id,title,priority,due_at,completed_at,tags";

interface TaskRow {
  id: string;
  title: string;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  tags: string[] | null;
}

const toTask = (row: TaskRow) => new Task(row.id, row.title, row.priority, row.due_at, row.completed_at, row.tags ?? []);

/** `personal_tasks` rows of one owner. Every query is limited to that owner and to one-off tasks. */
export class SupabaseTaskRepository implements TaskRepository {
  constructor(private readonly db: SupabaseClient, private readonly ownerId: string) {}

  async list() {
    const { data, error } = await this.db.from("personal_tasks").select(columns)
      .eq("owner_id", this.ownerId).eq("recurrence", "none")
      .order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(toTask);
  }

  async listOpenDueBefore(before: Date) {
    const { data, error } = await this.db.from("personal_tasks").select(columns)
      .eq("owner_id", this.ownerId).eq("recurrence", "none").is("completed_at", null)
      .or(`due_at.is.null,due_at.lt.${before.toISOString()}`)
      .order("due_at", { ascending: true, nullsFirst: false }).limit(50);
    if (error) throw error;
    return (data ?? []).map(toTask);
  }

  async add(details: TaskDetails) {
    const { error } = await this.db.from("personal_tasks")
      .insert({ owner_id: this.ownerId, title: details.title, priority: details.priority, due_at: details.dueAt, tags: details.tags });
    if (error) throw error;
  }

  async update(id: string, details: TaskDetails) {
    const { error } = await this.change(id, { title: details.title, priority: details.priority, due_at: details.dueAt, tags: details.tags }).select("id").single();
    if (error) throw error;
  }

  async setCompletedAt(id: string, completedAt: string | null) {
    const { error } = await this.change(id, { completed_at: completedAt }).select("id").single();
    if (error) throw error;
  }

  async undoCompletion(id: string, completedAt: string) {
    const { error } = await this.change(id, { completed_at: null }).eq("completed_at", completedAt).select("id").single();
    if (error) throw new DomainError("TASK_CHANGED", "Việc đã thay đổi hoặc không thể hoàn tác. Hãy tải lại danh sách.");
  }

  async remove(id: string) {
    const { error } = await this.db.from("personal_tasks").delete()
      .eq("id", id).eq("owner_id", this.ownerId).eq("recurrence", "none").select("id").single();
    if (error) throw error;
  }

  /** An update that can only touch this owner's one-off task `id`. `.single()` makes a missing row an error. */
  private change(id: string, values: Record<string, unknown>) {
    return this.db.from("personal_tasks").update(values).eq("id", id).eq("owner_id", this.ownerId).eq("recurrence", "none");
  }
}
