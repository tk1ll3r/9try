// The push worker without Deno in it, so that it can be run and tested on Node as well.
//
// The database decides what is due and who may be pushed to (`claim_push_batch`) and what a
// device's answer means (`finish_push`), in supabase/migrations/0035_push_delivery.sql. This file
// only carries each claimed entry to its devices and reports what they answered.
import { pushText, safeUrl, type Language } from "./notificationTexts.ts";

export interface PushDevice {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  language: Language;
}

/** One queue entry as `claim_push_batch` hands it out. `devices` is empty when the person is not to be pushed to. */
export interface PushItem {
  id: string;
  title: string;
  body: string;
  url: string;
  tag: string;
  private: boolean;
  devices: PushDevice[];
}

/** What one device answered. A status of 0 means the push service could not be reached. */
export interface PushResult {
  device: string;
  status: number;
  error: string | null;
}

export interface QueueStore {
  claim(limit: number): Promise<PushItem[]>;
  /** Without an id only the devices' records are updated, as after a test push. */
  finish(id: string | null, results: PushResult[]): Promise<void>;
}

/** Sends one message to one device and resolves with the push service's status. It does not throw. */
export type Sender = (device: PushDevice, payload: string) => Promise<{ status: number; error?: string }>;

/** What the service worker receives: the text in the device's language, and a link that cannot leave the app. */
export function payloadFor(item: Pick<PushItem, "title" | "body" | "url" | "tag" | "private">, language: Language): string {
  return JSON.stringify({ ...pushText(item, language), url: safeUrl(item.url), tag: item.tag });
}

export async function sendToDevices(item: Pick<PushItem, "title" | "body" | "url" | "tag" | "private">, devices: PushDevice[], send: Sender): Promise<PushResult[]> {
  return Promise.all(devices.map(async device => {
    const payload = payloadFor(item, device.language);
    const once = () => send(device, payload).catch(cause => ({ status: 0, error: String(cause?.message ?? cause) }));
    let answer = await once();
    // Status 0: the push service was not reached, as when opening the connection times out. That
    // passes; one more try at once is better than the queue's own, which is two minutes away. Had
    // the first try arrived after all, the second replaces it on the device: they carry one tag.
    if (!answer.status) answer = await once();
    return { device: device.id, status: answer.status, error: answer.error ?? null };
  }));
}

/**
 * Works the queue until it is empty, or until `maxBatches` batches were taken; what is left waits
 * for the next call. An entry that could not be closed stays "being worked on", and the database
 * hands it out again ten minutes later.
 */
export async function runQueue(store: QueueStore, send: Sender, maxBatches = 5): Promise<{ claimed: number; sent: number; refused: number }> {
  const total = { claimed: 0, sent: 0, refused: 0 };
  for (let batch = 0; batch < maxBatches; batch++) {
    const items = await store.claim(50);
    if (!items.length) break;
    total.claimed += items.length;
    for (const item of items) {
      const results = await sendToDevices(item, item.devices, send);
      total.sent += results.filter(result => result.status >= 200 && result.status < 300).length;
      total.refused += results.filter(result => result.status < 200 || result.status >= 300).length;
      await store.finish(item.id, results).catch(() => undefined);
    }
  }
  return total;
}
