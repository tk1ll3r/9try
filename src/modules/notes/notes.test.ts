import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { matchesSearch } from "../../kernel/text";
import { SupabaseNoteRepository } from "./infrastructure/SupabaseNoteRepository";

const mock = { from: vi.fn(), query: {} as Record<string, any>, result: { data: null, error: null as unknown } };
const repository = () => new SupabaseNoteRepository({ from: mock.from } as unknown as SupabaseClient, "vy");

beforeEach(() => {
  mock.result = { data: null, error: null };
  mock.query = {};
  for (const method of ["update", "delete", "eq", "select"]) mock.query[method] = vi.fn(() => mock.query);
  mock.query.single = vi.fn(async () => mock.result);
  mock.from.mockReset().mockReturnValue(mock.query);
});

describe("notes", () => {
  it("edits only the owner's selected note", async () => {
    await repository().update("note", " Title ", " Body ");
    expect(mock.from).toHaveBeenCalledWith("personal_notes");
    expect(mock.query.update).toHaveBeenCalledWith({ title: "Title", body: "Body" });
    expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "vy");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "note");
    expect(mock.query.single).toHaveBeenCalled();
  });
  it("deletes only the owner's selected note and reports failure", async () => {
    mock.result.error = new Error("denied");
    await expect(repository().remove("note")).rejects.toThrow("denied");
    expect(mock.query.eq).toHaveBeenCalledWith("owner_id", "vy");
    expect(mock.query.eq).toHaveBeenCalledWith("id", "note");
  });
  it("finds Vietnamese text typed without marks, in any word order", () => {
    expect(matchesSearch("Họp nhóm đồ án", "hop nhom")).toBe(true);
    expect(matchesSearch("Họp nhóm đồ án", "do an HOP")).toBe(true);
    expect(matchesSearch("Họp nhóm đồ án", "Đồ")).toBe(true);
    expect(matchesSearch("Họp nhóm đồ án", "hop lop")).toBe(false);
    expect(matchesSearch("Họp nhóm", "")).toBe(true);
  });
});
