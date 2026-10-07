import { describe, expect, it } from "vitest";
import { Profile } from "./domain/Profile";

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
