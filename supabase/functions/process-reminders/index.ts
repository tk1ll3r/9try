import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const MAX_ATTEMPTS = 5;
const RECOVERY_AFTER_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  const authorization = req.headers.get("authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return new Response("server not configured", { status: 500 });

  const db = createClient(url, serviceKey);
  const recoveryCutoff = new Date(Date.now() - RECOVERY_AFTER_MS).toISOString();

  await db
    .from("reminders")
    .update({ status: "pending", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", recoveryCutoff)
    .lt("attempts", MAX_ATTEMPTS);

  await db
    .from("reminders")
    .update({ status: "failed", processing_started_at: null })
    .eq("status", "processing")
    .lt("processing_started_at", recoveryCutoff)
    .gte("attempts", MAX_ATTEMPTS);

  const { data: due, error: dueError } = await db
    .from("reminders")
    .select("*")
    .eq("status", "pending")
    .lte("due_at", new Date().toISOString())
    .lt("attempts", MAX_ATTEMPTS)
    .order("due_at", { ascending: true })
    .limit(100);

  if (dueError) return Response.json({ error: dueError.message }, { status: 500 });

  configureWebPush();

  let delivered = 0;
  let failed = 0;

  for (const reminder of due ?? []) {
    const nextAttempts = Number(reminder.attempts ?? 0) + 1;
    const startedAt = new Date().toISOString();

    const { data: claimed, error: claimError } = await db
      .from("reminders")
      .update({
        status: "processing",
        processing_started_at: startedAt,
        attempts: nextAttempts,
      })
      .eq("id", reminder.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) continue;

    const title = String(reminder.payload?.title ?? "Nhắc việc");
    const body = String(reminder.payload?.body ?? "Bạn có một việc sắp tới.");
    const actionPath = typeof reminder.payload?.action_path === "string"
      ? reminder.payload.action_path
      : "/notifications";

    const { error: notificationError } = await db
      .from("notifications")
      .upsert({
        user_id: reminder.user_id,
        category: reminder.category,
        title,
        body,
        action_path: actionPath,
        dedupe_key: reminder.idempotency_key,
      }, {
        onConflict: "dedupe_key",
        ignoreDuplicates: true,
      });

    if (notificationError) {
      const terminal = nextAttempts >= MAX_ATTEMPTS;
      await db
        .from("reminders")
        .update({
          status: terminal ? "failed" : "pending",
          processing_started_at: null,
        })
        .eq("id", reminder.id);
      failed++;
      continue;
    }

    await tryPush(db, {
      userId: reminder.user_id,
      category: reminder.category,
      title,
      body,
      actionPath,
      tag: reminder.idempotency_key,
    });

    const { error: deliveredError } = await db
      .from("reminders")
      .update({
        status: "delivered",
        delivered_at: new Date().toISOString(),
        processing_started_at: null,
      })
      .eq("id", reminder.id)
      .eq("status", "processing");

    if (deliveredError) {
      failed++;
    } else {
      delivered++;
    }
  }

  return Response.json({ ok: true, delivered, failed });
});

function configureWebPush() {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
  const contact = Deno.env.get("WEB_PUSH_CONTACT");
  if (publicKey && privateKey && contact) {
    webpush.setVapidDetails(contact, publicKey, privateKey);
  }
}

async function tryPush(
  db: ReturnType<typeof createClient>,
  input: {
    userId: string;
    category: string;
    title: string;
    body: string;
    actionPath: string;
    tag: string;
  },
) {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY");
  const contact = Deno.env.get("WEB_PUSH_CONTACT");
  if (!publicKey || !privateKey || !contact) return;

  const { data: allowed } = await db.rpc("can_send_push", {
    p_user_id: input.userId,
    p_category: input.category,
  });
  if (!allowed) return;

  const { data: subscriptions } = await db
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", input.userId);

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.actionPath,
    tag: input.tag,
  });

  for (const subscription of subscriptions ?? []) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      }, payload);
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number }).statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await db.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }
}
