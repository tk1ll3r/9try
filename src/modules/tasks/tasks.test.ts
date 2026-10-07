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
    expect(Task.details({ title: "  Mua sách ", dueDate: "", priority: "low" })).toEqual({ title: "Mua sách", priority: "low", dueAt: null, tags: [] });
  });
  it("moves hashtags out of the title into labels, and puts them back for editing", () => {
    const details = Task.details({ title: "Nộp bài tập #GiảiTích tuần 5 #gấp #giảitích", dueDate: "", priority: "medium" });
    expect(details.title).toBe("Nộp bài tập tuần 5");
    expect(details.tags).toEqual(["giảitích", "gấp"]);
    expect(new Task("t", details.title, "medium", null, null, details.tags).draftTitle).toBe("Nộp bài tập tuần 5 #giảitích #gấp");
    // A "#" inside a word is not a label, and a title of labels only is still empty.
    expect(Task.details({ title: "Phòng B#4 và C#", dueDate: "", priority: "medium" })).toMatchObject({ title: "Phòng B#4 và C#", tags: [] });
    expect(() => Task.details({ title: "#gấp", dueDate: "", priority: "medium" })).toThrow(/tên công việc/);
  });
  it("keeps a due time when one is given, and treats 23:59 as any time that day", () => {
    const timed = Task.details({ title: "Nộp bài", dueDate: "2026-10-06", dueTime: "14:00", priority: "medium" });
    expect(timed.dueAt).toBe(new Date(2026, 9, 6, 14, 0).toISOString());
    const task = new Task("t", "Nộp bài", "medium", timed.dueAt, null);
    expect([task.dueDate, task.dueTime]).toEqual(["2026-10-06", "14:00"]);
    expect(task.dueLabel).toContain("14:00");
    // Overdue from the minute after the time, while the day is still "today" for an untimed task.
    expect(task.isOverdue(new Date(2026, 9, 6, 13, 59))).toBe(false);
    expect(task.isOverdue(new Date(2026, 9, 6, 14, 1))).toBe(true);
    expect(task.section(new Date(2026, 9, 6, 14, 1))).toBe("overdue");
    const anyTime = new Task("t", "x", "medium", Task.details({ title: "x", dueDate: "2026-10-06", priority: "medium" }).dueAt, null);
    expect(anyTime.dueTime).toBe("");
    expect(anyTime.section(new Date(2026, 9, 6, 22))).toBe("today");
    // Clearing the time of a timed task moves it back to the end of the day.
    expect(Task.details({ title: "Nộp bài", dueDate: "2026-10-06", dueTime: "", priority: "medium" }, task).dueAt).toBe(new Date(2026, 9, 6, 23, 59).toISOString());
  });
  it("sorts an open task into overdue, today, upcoming or undated", () => {
    const now = new Date(2026, 9, 6, 9);
    const due = (day: number) => new Task("t", "x", "medium", new Date(2026, 9, day, 23, 59).toISOString(), null);
    expect([due(5), due(6), due(7), new Task("t", "x", "medium", null, null)].map(task => task.section(now))).toEqual(["overdue", "today", "upcoming", "undated"]);
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
    await service().edit(new Task("task", "old", "medium", original, null), { title: "  edited  ", dueDate: "2026-10-05", dueTime: "13:30", priority: "high" });
    expect(mock.query.update).toHaveBeenCalledWith({ title: "edited", priority: "high", due_at: original, tags: [] });
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
