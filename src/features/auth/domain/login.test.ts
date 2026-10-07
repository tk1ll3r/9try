import { describe, expect, it } from "vitest";
import { isLocalBackend, loginError, loginRedirect } from "./login";

describe("login safety and feedback", () => {
  it("builds the email link from an already-checked in-app path", () => {
    expect(loginRedirect("https://gnouht.space", "/invite/group/test_token-1")).toBe("https://gnouht.space/invite/group/test_token-1");
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
