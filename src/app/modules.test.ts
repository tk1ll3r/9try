import { describe, expect, it } from "vitest";
import { isPlainPath, preloadRoute } from "../kernel/module";
import { directory, primaryScreens } from "../kernel/navigation";
import { defaultShortcuts } from "../modules/menu/domain/shortcuts";
import { loginRedirect } from "../modules/identity/domain/login";
import { registry } from "./modules";

describe("module registry", () => {
  it("accepts only plain routes of registered modules as outside-supplied paths", () => {
    for (const path of ["/", "/today", "/groups", "/groups/1234", "/invite/group/test_token-1", "/invite/friend/abc123", "/me/friends", "/notifications", "/calendar/shared/abc", "/habits", "/notes", "/me/privacy", "/me/organizer", "/stats", "/expenses", "/meetups", "/meetups/22222222-2222-4222-8222-222222222222", "/free-time", "/moments", "/moments/22222222-2222-4222-8222-222222222222", "/moments/22222222-2222-4222-8222-222222222222/33333333-2222-4222-8222-222222222222"]) expect(registry.safePath(path)).toBe(path);
    for (const path of ["//evil.test", "//groups", "https://evil.test", "/calendar?access_token=secret", "/unknown", "/invite/group/../../evil", "/groups/a/b"]) expect(registry.safePath(path)).toBe("/");
  });
  it("lets only a plain path into the emailed sign-in link, before the modules are loaded", () => {
    for (const path of ["/", "/groups/1234", "/not-a-route-yet"]) expect(isPlainPath(path)).toBe(true);
    for (const path of ["//evil.test", "https://evil.test", "/a//evil.test", "/calendar?next=//evil.test", "/a\\evil.test", "/a@evil.test", ""]) expect(isPlainPath(path)).toBe(false);
    expect(loginRedirect("https://app.test", "/groups/1234")).toBe("https://app.test/groups/1234");
  });
  it("has five screens in the bottom bar, Mode first and the Menu last", () => {
    expect(primaryScreens(registry.navigation).map(item => item.to)).toEqual(["/", "/calendar", "/chat", "/me/location", "/menu"]);
  });
  it("lists every screen in the Menu once, keeps top-bar screens in their own place, and gives each a route", () => {
    const listed = directory(registry.navigation).flatMap(part => part.items).map(item => item.to);
    expect(new Set(listed).size).toBe(listed.length);
    const screens = registry.navigation.filter(item => item.tab !== "menu" && item.tab !== "inbox" && item.tab !== "me").map(item => item.to).sort();
    expect([...listed].sort()).toEqual(screens);
    for (const item of registry.navigation.filter(item => item.parent && item.tab !== "inbox" && item.tab !== "me")) {
      expect(listed).toContain(item.to);
      expect(registry.navigation.some(parent => parent.to === item.parent)).toBe(true);
    }
    for (const to of ["/notifications", "/me", "/me/privacy", "/me/settings"]) expect(listed).not.toContain(to);
    for (const to of [...defaultShortcuts, ...registry.navigation.map(item => item.to), "/groups"]) expect(registry.safePath(to)).toBe(to);
    for (const hidden of ["/today", "/me/organizer", "/stats", "/meetups", "/expenses"]) expect(registry.navigation.some(item => item.to === hidden)).toBe(false);
  });
  it("starts the download of the screen a press will open, preferring the longer path", () => {
    const calls: string[] = [];
    const routes = [
      { path: "chat", component: () => null, preload: () => calls.push("list") },
      { path: "chat/:conversationId", component: () => null, preload: () => calls.push("thread") },
      { path: "me/location", component: () => null, preload: () => calls.push("map") },
    ];
    preloadRoute(routes, "/chat");
    preloadRoute(routes, "/chat/abc");
    preloadRoute(routes, "/nope");
    expect(calls).toEqual(["list", "thread"]);
  });
  it("gives every module a unique id", () => {
    const ids = registry.modules.map(module => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
