import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The function runs on Deno. Here its handler runs on Node, with Deno's globals and the database replaced.
const feeds = new Map<string, string>();
const asked: string[] = [];
const event = {
  id: "e1", title: "Sinh nhật Kha", event_kind: "all_day", start_at: null, end_at: null, all_day_start: "2026-10-20", all_day_end_exclusive: "2026-10-21",
  timezone: "Asia/Ho_Chi_Minh", recurrence_rule: null, recurrence_until: null, calendar_event_exceptions: [],
};
vi.mock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));
vi.mock("jsr:@supabase/supabase-js@2", () => ({
  createClient: () => ({
    from(table: string) {
      const query: Record<string, any> = {
        select: () => query,
        eq(column: string, value: string) { asked.push(`${table}.${column}=${value}`); query.value = value; return query; },
        maybeSingle: async () => ({ data: feeds.has(query.value) ? { owner_id: feeds.get(query.value) } : null }),
        then: (resolve: (result: unknown) => unknown) => resolve({ data: [event], error: null }),
      };
      return query;
    },
  }),
}));

let handler: (request: Request) => Promise<Response>;
const get = (query: string, method = "GET") => handler(new Request(`https://project.example/functions/v1/calendar-feed${query}`, { method }));
const token = "ab".repeat(32);

beforeAll(async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://db.example", SUPABASE_SERVICE_ROLE_KEY: "service" };
  vi.stubGlobal("Deno", { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (name: string) => env[name] } });
  await import("./index.ts");
  // The same digest the database stores: encode(sha256(convert_to(token, 'UTF8')), 'hex').
  feeds.set(createHash("sha256").update(token).digest("hex"), "owner-1");
});

describe("calendar-feed function", () => {
  it("answers not found without touching the database when the token is not 64 hex characters", async () => {
    for (const query of ["", "?token=", "?token=abc", `?token=${"AB".repeat(32)}`, `?token=${token}0`, `?token=${"zz".repeat(32)}`]) {
      expect((await get(query)).status).toBe(404);
    }
    expect((await get(`?token=${token}`, "POST")).status).toBe(404);
    expect(asked).toEqual([]);
  });
  it("answers not found for a well-formed token nobody owns", async () => {
    const response = await get(`?token=${"cd".repeat(32)}`);
    expect(response.status).toBe(404);
    expect(asked.some(entry => entry.startsWith("calendar_events"))).toBe(false);
  });
  it("returns the calendar of the token's owner, and only theirs", async () => {
    asked.length = 0;
    const response = await get(`?token=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    const text = await response.text();
    expect(text).toContain("BEGIN:VCALENDAR");
    expect(text).toContain("SUMMARY:Sinh nhật Kha");
    expect(asked).toEqual([`calendar_feeds.token_hash=${createHash("sha256").update(token).digest("hex")}`, "calendar_events.owner_id=owner-1"]);
  });
});
