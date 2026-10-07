import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskService } from "./application/TaskService";
import { Task } from "./domain/Task";
import { SupabaseTaskRepository } from "./infrastructure/SupabaseTaskRepository";

const mock = { from: vi.fn(), query: {} as Record<string, any>, result: { data: [] as any[], error: null as unknown } };
const repository = () => new SupabaseTaskRepository({ from: mock.from } as unknown as SupabaseClient, "owner");
const service = () => new TaskService(repository());

beforeEach(() => {
  mock.result = { data: [], error: null };
  mock.query = {};
  for (const method of ["select", "eq", "is", "or", "order", "limit", "insert", "update", "delete"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.single = vi.fn(async () => mock.result);
  mock.query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mock.result).then(resolve);
  mock.from.mockReset().mockReturnValue(mock.query);
});

describe("task rules", () => {
  it("requires a title and trims it", () => {
    expect(() => Task.details({ title: "   ", dueDate: "", priority: "medium" })).toThrow(/tên công việc/);
    expect(Task.details({ title: "  Mua sách ", dueDate: "", priority: "low" })).toEqual({ title: "Mua sách", priority: "low", dueAt: null });
  });
  it("is overdue only when open and due before today on this device", () => {
    const now = new Date(2026, 9, 6, 9);
    const due = (day: number, completedAt: string | null = null) => new Task("t", "x", "medium", new Date(2026, 9, day, 23, 59).toISOString(), completedAt);
    expect(due(5).isOverdue(now)).toBe(true);
    expect(due(6).isOverdue(now)).toBe(false);
    expect(due(5, "2026-10-05T10:00:00Z").isOverdue(now)).toBe(false);
    expect(new Task("t", "x", "medium", null, null).isOverdue(now)).toBe(false);
  });
});

describe("owner-scoped task storage", () => {
  it("lists all one-off tasks including future/completed without completion filtering", async () => {
    mock.result.data = [{ id: "future", due_at: "2099-01-01", completed_at: null }, { id: "done", completed_at: "2026-01-01" }];
    expect((await service().list()).map(task => task.done)).toEqual([false, true]);
    expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "owner"); expect(mock.query.eq).toHaveBeenCalledWith("recurrence", "none");
    expect(mock.query.is).not.toHaveBeenCalledWith("completed_at", null);
  });
  it("preserves unchanged due timestamp on edit and scopes every mutation", async () => {
    const original = new Date(2026, 9, 5, 13, 30).toISOString();
    await service().edit(new Task("task", "old", "medium", original, null), { title: "  edited  ", dueDate: "2026-10-05", priority: "high" });
    expect(mock.query.update).toHaveBeenCalledWith({ title: "edited", priority: "high", due_at: original });
    expect(mock.query.eq).toHaveBeenCalledWith("id", "task"); expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "owner"); expect(mock.query.eq).toHaveBeenCalledWith("recurrence", "none");
    await service().remove("task"); expect(mock.query.delete).toHaveBeenCalled(); expect(mock.query.single).toHaveBeenCalledTimes(2);
  });
  it("completion Undo only matches the completion it created", async () => {
    const timestamp = await service().complete("task");
    expect(timestamp).toBeTruthy(); await service().undoCompletion("task", timestamp);
    expect(mock.query.eq).toHaveBeenCalledWith("completed_at", timestamp); expect(mock.query.update).toHaveBeenLastCalledWith({ completed_at: null });
  });
  it("reports update/undo failure instead of claiming success", async () => {
    mock.result.error = new Error("denied");
    await expect(service().reopen("task")).rejects.toThrow("denied");
    await expect(service().undoCompletion("task", "old")).rejects.toThrow(/đã thay đổi/);
  });
  it("Today asks for open tasks that are undated or due before tomorrow", async () => {
    await new TaskService(repository(), { now: () => new Date(2026, 9, 6, 9) }).dueToday();
    expect(mock.query.is).toHaveBeenCalledWith("completed_at", null);
    expect(mock.query.or).toHaveBeenCalledWith(`due_at.is.null,due_at.lt.${new Date(2026, 9, 7).toISOString()}`);
  });
});
