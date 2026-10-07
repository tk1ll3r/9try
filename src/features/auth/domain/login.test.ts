import { describe, expect, it } from "vitest";
import { isLocalBackend, loginError, loginRedirect, safeReturnPath } from "./login";

describe("login safety and feedback", () => {
  it("preserves known same-origin invitations and excludes redirects/tokens", () => {
    expect(loginRedirect("https://gnouht.space", "/invite/group/test_token-1")).toBe("https://gnouht.space/invite/group/test_token-1");
    for (const path of ["//evil.test", "https://evil.test", "/calendar?access_token=secret", "/unknown", "/invite/group/../../evil"]) expect(safeReturnPath(path)).toBe("/");
  });
  it("maps quota and unauthorized recipients without pretending delivery", () => {
    expect(loginError({ status: 429 })).toContain("giới hạn");
    expect(loginError({ code: "email_address_not_authorized" })).toContain("SMTP");
    expect(loginError(new Error("smtp failed"))).toContain("Auth/SMTP");
    expect(loginError(new Error("connection failure with secret data"))).not.toContain("secret");
  });
  it("only gives Mailpit instructions for loopback backends", () => {
    expect(isLocalBackend("http://127.0.0.1:54321")).toBe(true);
    expect(isLocalBackend("http://localhost:54321")).toBe(true);
    expect(isLocalBackend("http://[::1]:54321")).toBe(true);
    expect(isLocalBackend("https://project.supabase.co")).toBe(false);
    expect(isLocalBackend(undefined)).toBe(false);
  });
});
