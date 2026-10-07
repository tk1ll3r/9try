import { describe, expect, it } from "vitest";
import { registry } from "./modules";

describe("module registry", () => {
  it("accepts only plain routes of registered modules as outside-supplied paths", () => {
    for (const path of ["/", "/groups", "/groups/1234", "/invite/group/test_token-1", "/me/friends", "/notifications", "/calendar/shared/abc"]) expect(registry.safePath(path)).toBe(path);
    for (const path of ["//evil.test", "//groups", "https://evil.test", "/calendar?access_token=secret", "/unknown", "/invite/group/../../evil", "/groups/a/b"]) expect(registry.safePath(path)).toBe("/");
  });
  it("gives every module a unique id", () => {
    const ids = registry.modules.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
