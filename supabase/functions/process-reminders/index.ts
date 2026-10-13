import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sweepMedia } from "../_shared/mediaSweep.ts";
import { runQueue } from "../_shared/pushQueue.ts";
import { configureWebPush, queueStore, send } from "../_shared/webPush.ts";

// The push worker. The database calls it when a notification is written and once a minute
// (supabase/migrations/0035_push_delivery.sql), with the secret that is compared here. It takes the
// queue entries that are due, sends each to the devices the database lists for it, and reports what
// every device answered. Deploy with JWT verification off (see supabase/config.toml).
//
// It has a second job, because it is the one thing that runs every minute with the service key: it
// removes the files of photos that are over (supabase/migrations/0040_moments.sql). That job does
// not need the push keys, and a failure of it never stops a push.
Deno.serve(async (request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("server not configured", { status: 500 });
  const queue = queueStore(url, serviceKey);
  // How many files were removed, or why none could be.
  const swept = await sweepMedia(queue.db).catch(cause => String((cause as Error).message ?? cause));
  // Without the keys nothing can be sent. The queue is left as it is: an entry that waited a week is dropped by the database.
  if (!configureWebPush()) return Response.json({ error: "push not configured", swept }, { status: 503 });

  try {
    return Response.json({ ok: true, ...await runQueue(queue, send), swept });
  } catch (cause) {
    return Response.json({ error: String((cause as Error).message ?? cause) }, { status: 500 });
  }
});
