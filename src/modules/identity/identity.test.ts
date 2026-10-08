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
  // The Supabase client reports a failure as an error that carries what it got back: the function's answer, or the network error.
  const failing = (message: string, context: unknown) => new SupabaseProfileRepository({
    functions: { invoke: async () => ({ data: null, error: Object.assign(new Error(message), { context }) }) },
  } as unknown as SupabaseClient, "me").deleteAccount().then(() => "deleted", cause => errorMessage(cause, "x"));
  const refused = "Edge Function returned a non-2xx status code";

  it("says why the server refused, in the app's words", async () => {
    expect(await failing(refused, Response.json({ error: "transfer ownership of groups with other members first" }, { status: 409 }))).toMatch(/chuyển quyền chủ nhóm/);
  });
  it("stays readable when the answer gives no reason, and when the function cannot be called at all", async () => {
    expect(await failing(refused, new Response("unauthorized", { status: 401 }))).toBe("Máy chủ chưa làm được việc này. Hãy thử lại sau.");
    expect(await failing("Failed to send a request to the Edge Function", new TypeError("Failed to fetch"))).toMatch(/^Chưa gọi được máy chủ cho việc này\./);
  });
});
