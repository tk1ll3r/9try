import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { toIcs } from "../_shared/ics.ts";

// Google or Apple Calendar fetch this address on a schedule and cannot sign in, so the token in the
// address is the only key. Only its SHA-256 is stored. Anything unrecognized gets the same "not found".
// Deploy with JWT verification off (see supabase/config.toml).
Deno.serve(async (request) => {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (request.method !== "GET" || !/^[0-9a-f]{64}$/.test(token)) return new Response("not found", { status: 404 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("server not configured", { status: 500 });
  const db = createClient(url, serviceKey);

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const { data: feed } = await db.from("calendar_feeds").select("owner_id").eq("token_hash", hash).maybeSingle();
  if (!feed) return new Response("not found", { status: 404 });

  const { data: events, error } = await db.from("calendar_events")
    .select("*, calendar_event_exceptions(occurrence_date,canceled,override_title,override_start_at,override_end_at,override_all_day_start,override_all_day_end_exclusive)")
    .eq("owner_id", feed.owner_id);
  if (error) return new Response("temporarily unavailable", { status: 503 });

  return new Response(toIcs(events ?? []), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900" },
  });
});
