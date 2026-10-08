import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { errorMessage } from "../../kernel/errors";
import { Profile } from "./domain/Profile";
import { SupabaseProfileRepository } from "./infrastructure/SupabaseProfileRepository";

const input = { displayName: " Vy ", username: " Vy_01 ", bio: "", timezone: "Asia/Ho_Chi_Minh", birthday: "" };

describe("profile rules", () => {
  it("trims the name and lower-cases the username", () => {
    const profile = Profile.check(input);
    expect([profile.displayName, profile.username, profile.complete]).toEqual(["Vy", "vy_01", true]);
  });
  it("requires a name and a well-formed username", () => {
    expect(() => Profile.check({ ...input, displayName: "  " })).toThrow(/tên hiển thị/);
    for (const username of ["ab", "có dấu", "a".repeat(21), "with-dash"]) expect(() => Profile.check({ ...input, username })).toThrow(/Username/);
  });
  it("allows saving without a username but reports the profile as incomplete", () => {
    expect(Profile.check({ ...input, username: "" }).complete).toBe(false);
  });
});

describe("account deletion", () => {
  // The Supabase client reports a refusal as an error that carries the function's answer.
  const refusing = (answer: Response) => new SupabaseProfileRepository({
    functions: { invoke: async () => ({ data: null, error: Object.assign(new Error("Edge Function returned a non-2xx status code"), { context: answer }) }) },
  } as unknown as SupabaseClient, "me");
  const failure = (answer: Response) => refusing(answer).deleteAccount().then(() => "deleted", cause => errorMessage(cause, "x"));

  it("says why the server refused, in the app's words", async () => {
    expect(await failure(Response.json({ error: "transfer ownership of groups with other members first" }, { status: 409 }))).toMatch(/chuyển quyền chủ nhóm/);
  });
  it("says the server is behind when the function is not there, and stays readable when the answer says nothing", async () => {
    expect(await failure(Response.json({ code: "NOT_FOUND" }, { status: 404 }))).toBe("Tính năng này chưa dùng được vì máy chủ chưa được cập nhật.");
    expect(await failure(new Response("unauthorized", { status: 401 }))).toBe("Máy chủ chưa làm được việc này. Hãy thử lại sau.");
  });
});
