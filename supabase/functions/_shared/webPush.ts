// Web Push for the two functions that send it: the queue worker and the test push.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import type { PushItem, PushResult, QueueStore, Sender } from "./pushQueue.ts";

/** Sets the keys every push is signed with. False when the function was deployed without them. */
export function configureWebPush(): boolean {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
  const contact = Deno.env.get("WEB_PUSH_CONTACT");
  if (!publicKey || !privateKey || !contact) return false;
  webpush.setVapidDetails(contact, publicKey, privateKey);
  return true;
}

/** A push that nobody picked up within an hour is no longer worth delivering. */
export const send: Sender = async (device, payload) => {
  try {
    const answer = await webpush.sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }, payload, { TTL: 3600 });
    return { status: answer.statusCode };
  } catch (cause) {
    // The push service's own text is not kept: the status says enough, and it is shown to the device's owner.
    const status = Number((cause as { statusCode?: number }).statusCode ?? 0);
    // A connection that could not be opened comes with a code ("ETIMEDOUT") and sometimes without any message.
    const { message, code, name } = cause as { message?: string; code?: string; name?: string };
    return { status, error: status ? `HTTP ${status}` : String(message || code || name || cause).slice(0, 200) };
  }
};

/** The queue in the database, reached with the service key. `db` is the same client, for what else a function reads. */
export function queueStore(url: string, serviceKey: string) {
  const db = createClient(url, serviceKey);
  const store: QueueStore = {
    async claim(limit) {
      const { data, error } = await db.rpc("claim_push_batch", { p_limit: limit });
      if (error) throw error;
      return (data ?? []) as PushItem[];
    },
    async finish(id: string | null, results: PushResult[]) {
      const { error } = await db.rpc("finish_push", { p_id: id, p_results: results });
      if (error) throw error;
    },
  };
  return { ...store, db };
}
