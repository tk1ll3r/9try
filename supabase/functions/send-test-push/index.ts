import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";
import { sendToDevices, type PushDevice } from "../_shared/pushQueue.ts";
import { configureWebPush, queueStore, send } from "../_shared/webPush.ts";

// "Gửi thông báo thử": sends one push to every device of the person who asks, at once, and answers
// with what each device's push service said. The settings screen shows that answer, so a person can
// tell a device that works from one that does not without waiting for a real notification.
Deno.serve(async (request) => {
  const asked = preflight(request);
  if (asked) return asked;
  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authorization = request.headers.get("authorization");
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "server not configured" }, 500);
  if (!authorization) return json({ error: "unauthorized" }, 401);
  const { data: who } = await createClient(url, anonKey, { global: { headers: { Authorization: authorization } } }).auth.getUser();
  if (!who.user) return json({ error: "unauthorized" }, 401);
  if (!configureWebPush()) return json({ error: "push not configured" }, 503);

  const store = queueStore(url, serviceKey);
  const { data: devices, error } = await store.db.from("push_subscriptions").select("id,endpoint,p256dh,auth,language").eq("user_id", who.user.id);
  if (error) return json({ error: "temporarily unavailable" }, 503);

  const results = await sendToDevices({
    title: "Thông báo thử", body: "Thiết bị này nhận được thông báo đẩy của Gnouht.", url: "/me/settings", tag: "test", private: false,
  }, (devices ?? []) as PushDevice[], send);
  // The devices keep what they answered; an address a browser gave up is removed.
  await store.finish(null, results).catch(() => undefined);
  return json({ devices: results });
});
