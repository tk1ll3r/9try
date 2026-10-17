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

/**
 * Media proxy: serves image files from R2 cache, falling back to the upstream
 * Supabase Storage signed URL on a miss. The R2 key is `<bucket>/<path>`, the
 * same structure as Supabase Storage.
 *
 * Security:
 * 1. The `origin` parameter is strictly validated:
 *    - Must be HTTPS to `*.supabase.co` or configured Supabase host.
 *    - Must match `/storage/v1/object/sign/<bucket>/<key>`.
 *    - Must include a `token` query parameter.
 * 2. On a cache hit (file present in R2), the token is verified via a fast HEAD
 *    check to Supabase (headers only, ~200B, 0 byte file egress). An attacker
 *    without a valid signed token cannot access cached private chat or moment photos.
 * 3. On a cache miss, the file is fetched directly from Supabase, stored in R2,
 *    and streamed to the client with strict security headers.
 */
export async function handleMedia(request, env, ctx) {
  const url = new URL(request.url);
  const rest = url.pathname.slice("/media/".length);
  const slash = rest.indexOf("/");
  if (slash < 1) return json({ error: "Bad media path" }, 400);

  const bucket = rest.slice(0, slash);
  const key = rest.slice(slash + 1);
  if (!key || (bucket !== "chat" && bucket !== "moments")) {
    return json({ error: "Invalid media bucket or path" }, 400);
  }

  const origin = url.searchParams.get("origin");
  if (!origin) return json({ error: "Missing origin parameter" }, 400);

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return json({ error: "Invalid origin URL" }, 400);
  }

  // Security: prevent SSRF and cross-tenant authorization bypass.
  // Only allow HTTPS requests to the project's official Supabase storage endpoints.
  const ALLOWED_ORIGIN_HOSTS = new Set([
    "jqmkfgmfisjmqizqyyct.supabase.co",
    "nyyqzldznzcmihjwhueb.supabase.co",
  ]);
  if (originUrl.protocol !== "https:" || !ALLOWED_ORIGIN_HOSTS.has(originUrl.hostname)) {
    return json({ error: "Untrusted origin host" }, 403);
  }

  // Security: origin path must match the requested bucket and object key.
  const expectedPath = `/storage/v1/object/sign/${bucket}/${key}`;
  if (originUrl.pathname !== expectedPath || !originUrl.searchParams.get("token")) {
    return json({ error: "Origin path or token mismatch" }, 403);
  }

  const r2Key = `${bucket}/${key}`;

  // 1. Try R2 cache if available.
  let cached = null;
  if (env.MEDIA) {
    try {
      cached = await env.MEDIA.get(r2Key);
    } catch {
      cached = null;
    }
  }
  if (cached) {
    // Security: verify the caller holds a valid, unexpired signature from Supabase
    // before serving private media from R2 cache. A HEAD request transfers headers only (~200B).
    try {
      const authCheck = await fetch(origin, { method: "HEAD" });
      if (!authCheck.ok) {
        return json({ error: "Unauthorized media access" }, 403);
      }
    } catch {
      return json({ error: "Authorization verification failed" }, 502);
    }

    const headers = new Headers();
    cached.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=604800, immutable");
    headers.set("X-Cache", "HIT");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(cached.body, { headers });
  }

  // 2. Cache miss — fetch from Supabase through the signed URL.
  let upstream;
  try {
    upstream = await fetch(origin);
  } catch {
    return json({ error: "Upstream fetch failed" }, 502);
  }

  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  // 3. Stream the file to the browser and store it in R2 in the background.
  const contentType = upstream.headers.get("Content-Type") || "image/jpeg";
  const [forClient, forR2] = upstream.body.tee();

  if (env.MEDIA) {
    ctx.waitUntil(
      env.MEDIA.put(r2Key, forR2, { httpMetadata: { contentType } }).catch(() => undefined)
    );
  }

  return new Response(forClient, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Cache": "MISS",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const counter = env.PUBLIC_REQUESTS.get(env.PUBLIC_REQUESTS.idFromName(COUNTER_ID));
    const url = new URL(request.url);

    // Media proxy — cached files from R2, falling back to Supabase Storage.
    if (url.pathname.startsWith("/media/") && request.method === "GET") {
      return handleMedia(request, env, ctx);
    }

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
