import { describe, expect, it } from "vitest";
import { isPlainPath } from "../kernel/module";
import { loginRedirect } from "../modules/identity/domain/login";
import { registry } from "./modules";

describe("module registry", () => {
  it("accepts only plain routes of registered modules as outside-supplied paths", () => {
    for (const path of ["/", "/groups", "/groups/1234", "/invite/group/test_token-1", "/invite/friend/abc123", "/me/friends", "/notifications", "/calendar/shared/abc", "/habits", "/notes", "/me/privacy", "/me/organizer", "/meetups", "/meetups/22222222-2222-4222-8222-222222222222"]) expect(registry.safePath(path)).toBe(path);
    for (const path of ["//evil.test", "//groups", "https://evil.test", "/calendar?access_token=secret", "/unknown", "/invite/group/../../evil", "/groups/a/b"]) expect(registry.safePath(path)).toBe("/");
  });
  it("lets only a plain path into the emailed sign-in link, before the modules are loaded", () => {
    for (const path of ["/", "/groups/1234", "/not-a-route-yet"]) expect(isPlainPath(path)).toBe(true);
    for (const path of ["//evil.test", "https://evil.test", "/a//evil.test", "/calendar?next=//evil.test", "/a\\evil.test", "/a@evil.test", ""]) expect(isPlainPath(path)).toBe(false);
    expect(loginRedirect("https://app.test", "/groups/1234")).toBe("https://app.test/groups/1234");
  });
  it("gives every module a unique id", () => {
    const ids = registry.modules.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
