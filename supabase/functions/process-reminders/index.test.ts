import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runQueue, type PushItem, type PushResult } from "../_shared/pushQueue.ts";

// The worker runs on Deno. Here its handler runs on Node, with Deno's globals, the database and the
// push services replaced. `queue` is what the database would hand out, batch by batch.
const env: Record<string, string | undefined> = {};
const queue: PushItem[][] = [];
const finished: { id: string | null; results: PushResult[] }[] = [];
const sent: { endpoint: string; payload: Record<string, string>; options: unknown }[] = [];
/** What each push service answers, by address. Anything not listed answers 201. */
const answers: Record<string, number | Error> = {};
/** The files the database lists as left behind, what the worker removed of them, and whether Storage refuses. */
const orphans: { bucket: string; name: string }[] = [];
const removed: { bucket: string; names: string[] }[] = [];
const storage = { down: false };

vi.mock("jsr:@supabase/functions-js/edge-runtime.d.ts", () => ({}));
vi.mock("jsr:@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_push_batch") return { data: queue.shift() ?? [], error: null };
      if (name === "orphan_media_files") return { data: orphans.splice(0), error: null };
      finished.push({ id: args.p_id as string | null, results: args.p_results as PushResult[] });
      return { data: null, error: null };
    },
    storage: { from: (bucket: string) => ({ remove: async (names: string[]) => {
      if (storage.down) return { error: { message: "storage is down" } };
      removed.push({ bucket, names });
      return { error: null };
    } }) },
  }),
}));
vi.mock("npm:web-push@3.6.7", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: async (subscription: { endpoint: string }, payload: string, options: unknown) => {
      sent.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload), options });
      const answer = answers[subscription.endpoint] ?? 201;
      if (answer instanceof Error) throw answer;
      if (answer >= 300) throw Object.assign(new Error("push service refused"), { statusCode: answer, body: "secret detail of the push service" });
      return { statusCode: answer };
    },
  },
}));

let handler: (request: Request) => Promise<Response>;
const call = (secret?: string) => handler(new Request("https://project.example/functions/v1/process-reminders", { method: "POST", headers: secret ? { authorization: `Bearer ${secret}` } : {} }));
const device = (id: string, language: "vi" | "en" = "vi") => ({ id, endpoint: `https://push.example/${id}`, p256dh: "key", auth: "auth", language });
const item = (id: string, extra: Partial<PushItem> = {}): PushItem => ({ id, title: "Tin nhắn mới · Kha", body: "", url: "/chat/c1", tag: `chat:${id}`, private: false, devices: [device("phone")], ...extra });

beforeAll(async () => {
  vi.stubGlobal("Deno", { serve: (fn: typeof handler) => { handler = fn; }, env: { get: (name: string) => env[name] } });
  await import("./index.ts");
});
beforeEach(() => {
  Object.assign(env, { CRON_SECRET: "s3cret", SUPABASE_URL: "http://db.example", SUPABASE_SERVICE_ROLE_KEY: "service", WEB_PUSH_VAPID_PUBLIC_KEY: "pub", WEB_PUSH_VAPID_PRIVATE_KEY: "priv", WEB_PUSH_CONTACT: "mailto:admin@example.test" });
  queue.length = finished.length = sent.length = orphans.length = removed.length = 0;
  storage.down = false;
  for (const key of Object.keys(answers)) delete answers[key];
});

describe("process-reminders function", () => {
  it("answers only to the secret it was deployed with", async () => {
    queue.push([item("r1")]);
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    env.CRON_SECRET = undefined;
    expect((await call("undefined")).status).toBe(401);
    expect(sent).toEqual([]);
    expect(queue).toHaveLength(1);
  });

  it("leaves the queue alone when it has no keys to sign a push with", async () => {
    queue.push([item("r1")]);
    env.WEB_PUSH_VAPID_PRIVATE_KEY = undefined;
    const response = await call("s3cret");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "push not configured", swept: 0 });
    expect(queue).toHaveLength(1);
  });

  it("removes the files of photos that are over through Storage, bucket by bucket, also where push has no keys", async () => {
    orphans.push({ bucket: "moments", name: "u1/a.jpg" }, { bucket: "chat", name: "c1/m1/0.jpg" }, { bucket: "moments", name: "u2/b.jpg" });
    env.WEB_PUSH_VAPID_PRIVATE_KEY = undefined;
    expect(await (await call("s3cret")).json()).toEqual({ error: "push not configured", swept: 3 });
    expect(removed).toEqual([{ bucket: "moments", names: ["u1/a.jpg", "u2/b.jpg"] }, { bucket: "chat", names: ["c1/m1/0.jpg"] }]);
  });

  it("still sends the pushes when the files cannot be removed, and says why they were not", async () => {
    orphans.push({ bucket: "moments", name: "u1/a.jpg" });
    storage.down = true;
    queue.push([item("r1")]);
    expect(await (await call("s3cret")).json()).toEqual({ ok: true, claimed: 1, sent: 1, refused: 0, swept: "storage is down" });
    expect(sent).toHaveLength(1);
  });

  it("sends each entry to its devices in their language, and reports what every device answered", async () => {
    answers["https://push.example/old-tab"] = 410;
    answers["https://push.example/flaky"] = 500;
    queue.push([
      item("r1", { devices: [device("phone", "en"), device("old-tab"), device("flaky")] }),
      item("r2", { title: "Kha vừa bật mode", body: "mode:coffee", url: "/", devices: [] }),
    ]);
    const response = await call("s3cret");
    expect(await response.json()).toEqual({ ok: true, claimed: 2, sent: 1, refused: 2, swept: 0 });
    expect(sent.map(push => [push.endpoint, push.payload.title])).toEqual([
      ["https://push.example/phone", "New message · Kha"], ["https://push.example/old-tab", "Tin nhắn mới · Kha"], ["https://push.example/flaky", "Tin nhắn mới · Kha"],
    ]);
    expect(sent[0].payload).toEqual({ title: "New message · Kha", body: "", url: "/chat/c1", tag: "chat:r1" });
    expect(sent[0].options).toEqual({ TTL: 3600 });
    // The database decides what a status means; the worker passes it on, without the push service's own words.
    expect(finished).toEqual([
      { id: "r1", results: [{ device: "phone", status: 201, error: null }, { device: "old-tab", status: 410, error: "HTTP 410" }, { device: "flaky", status: 500, error: "HTTP 500" }] },
      { id: "r2", results: [] },
    ]);
  });

  it("says nothing about who or what when the person asked for a private preview, and never follows a link out of the app", async () => {
    queue.push([item("r1", { private: true, devices: [device("phone", "en")] }), item("r2", { url: "https://evil.example/steal" })]);
    await call("s3cret");
    expect(sent[0].payload).toEqual({ title: "Gnouht Together", body: "You have a new notification.", url: "/chat/c1", tag: "chat:r1" });
    expect(sent[1].payload.url).toBe("/notifications");
  });

  it("reports a push service that cannot be reached as a failure, not as a crash, after trying it twice", async () => {
    answers["https://push.example/phone"] = new Error("getaddrinfo ENOTFOUND push.example");
    queue.push([item("r1")]);
    expect((await call("s3cret")).status).toBe(200);
    expect(finished).toEqual([{ id: "r1", results: [{ device: "phone", status: 0, error: "getaddrinfo ENOTFOUND push.example" }] }]);
    expect(sent).toHaveLength(2);
  });

  it("names a connection that timed out by its code when the error has no message", async () => {
    answers["https://push.example/phone"] = Object.assign(new AggregateError([], ""), { code: "ETIMEDOUT" });
    queue.push([item("r1")]);
    await call("s3cret");
    expect(finished[0].results).toEqual([{ device: "phone", status: 0, error: "ETIMEDOUT" }]);
  });

  it("does not ask a push service twice once it has answered, whatever the answer", async () => {
    answers["https://push.example/old"] = 410;
    queue.push([item("r1", { devices: [device("phone"), device("old")] })]);
    await call("s3cret");
    expect(sent.map(push => push.endpoint)).toEqual(["https://push.example/phone", "https://push.example/old"]);
  });
});

describe("working the queue", () => {
  const store = (batches: PushItem[][], failOn?: string) => ({
    claim: async () => batches.shift() ?? [],
    finish: async (id: string | null) => { if (id === failOn) throw new Error("database away"); finished.push({ id, results: [] }); },
  });
  const ok = async () => ({ status: 201 });

  it("goes on until the queue is empty", async () => {
    expect(await runQueue(store([[item("a"), item("b")], [item("c")]]), ok)).toEqual({ claimed: 3, sent: 3, refused: 0 });
  });
  it("stops after a few batches, so one call cannot run for ever", async () => {
    const endless = { claim: async () => [item("again")], finish: async () => undefined };
    expect((await runQueue(endless, ok, 3)).claimed).toBe(3);
  });
  it("tries once more at once when the push service was not reached, and counts what the second try brought", async () => {
    let calls = 0;
    const flaky = async () => ++calls === 1 ? { status: 0, error: "ETIMEDOUT" } : { status: 201 };
    expect(await runQueue(store([[item("a")]]), flaky)).toEqual({ claimed: 1, sent: 1, refused: 0 });
    expect(calls).toBe(2);
  });
  it("carries on when one entry cannot be closed", async () => {
    await runQueue(store([[item("a"), item("b")]], "a"), ok);
    expect(finished.map(entry => entry.id)).toEqual(["b"]);
  });
});
