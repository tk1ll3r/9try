import { DurableObject } from "cloudflare:workers";

// Cloudflare's sampled HTTP analytics estimate for 9try.gnouht.space from the first
// deployment (2026-10-08 02:16:40 UTC) through 2026-10-12 05:22:00 UTC.
const HISTORICAL_REQUEST_BASELINE = 22_521;
const COUNTER_ID = "all-app-host-requests";
const COUNTER_ENDPOINT = "https://request-counter";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export class PublicRequestCounter extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS public_request_counter (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        total INTEGER NOT NULL CHECK (total >= 0)
      )
    `);
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO public_request_counter (singleton, total) VALUES (1, ?)",
      HISTORICAL_REQUEST_BASELINE
    );
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || !["/increment", "/increment-and-read"].includes(pathname)) {
      return json({ error: "Not found" }, 404);
    }

    const row = this.ctx.storage.sql.exec(
      "UPDATE public_request_counter SET total = total + 1 WHERE singleton = 1 RETURNING total"
    ).toArray()[0];
    if (pathname === "/increment") return new Response(null, { status: 204 });
    return json({ requests: String(row.total) });
  }
}

export default {
  async fetch(request, env, ctx) {
    const counter = env.PUBLIC_REQUESTS.get(env.PUBLIC_REQUESTS.idFromName(COUNTER_ID));
    const url = new URL(request.url);

    // This same-host endpoint counts its own request and returns the resulting total atomically.
    if (url.pathname === "/api/public-request-count" && request.method === "GET") {
      try {
        return await counter.fetch(`${COUNTER_ENDPOINT}/increment-and-read`, { method: "POST" });
      } catch {
        return json({ error: "Request count unavailable" }, 503);
      }
    }

    // Keep static files and app responses off the Durable Object's critical path.
    ctx.waitUntil(
      counter.fetch(`${COUNTER_ENDPOINT}/increment`, { method: "POST" }).catch(() => undefined)
    );
    return env.ASSETS.fetch(request);
  }
};
