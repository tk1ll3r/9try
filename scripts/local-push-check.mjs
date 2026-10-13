// Real pushes, end to end, without a phone and without the cloud project.
//
//   DENO=/path/to/deno npm run test:push:local
//
// What is real: the app's production build with its service worker, in a browser that signs up with
// a real push service; the local Supabase stack (its database with pg_net, the vault and pg_cron, and
// Auth); and the two functions of supabase/functions, run on Deno. A push leaves the database, goes
// through the worker to the push service, and is shown by the service worker.
//
// It needs the local stack running with every migration applied (`supabase start`, then
// `supabase migration up --local`), Deno 2, Playwright's Chromium, and a way out to the internet.
// It never reaches the cloud project: every address in it is this machine's. It makes two accounts,
// a key pair and two vault entries for the run, and removes them at the end.
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { build, preview } from "vite";
import pg from "pg";
import { spawn } from "node:child_process";
import { createHmac, generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.chdir(new URL("..", import.meta.url).pathname);
const deno = process.env.DENO ?? "deno";
/** The build, the browser profiles and the functions' logs; removed when the run ends. */
const S = mkdtempSync(join(tmpdir(), "gnouht-push-check-"));
const api = "http://127.0.0.1:54321";
const origin = "http://127.0.0.1:54994";
const part = value => Buffer.from(JSON.stringify(value)).toString("base64url");
function localKey(role) {
  const body = `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase-demo", role, exp: 1983812996 })}`;
  return `${body}.${createHmac("sha256", "super-secret-jwt-token-with-at-least-32-characters-long").update(body).digest("base64url")}`;
}
const anonKey = localKey("anon"), serviceKey = localKey("service_role");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let failed = 0;
/** For what depends on the push service's own timing: said, and not counted as a failure of the app. */
const skipped = (what, why) => console.log(`skip  ${what}  ← ${why}`);
const check = (ok, what, detail = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${what}${ok || !detail ? "" : `  ← ${detail}`}`); if (!ok) failed++; return ok; };
async function until(read, good, ms = 30_000) {
  const end = Date.now() + ms; let value;
  for (;;) { value = await read(); if (good(value) || Date.now() > end) return value; await sleep(500); }
}

// Keys that exist for this run only.
const jwk = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
const cronSecret = randomBytes(32).toString("hex");

const db = new pg.Client({ connectionString: "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const one = async (text, values) => (await db.query(text, values)).rows[0];
const admin = createClient(api, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const children = []; const created = []; let context, server;
/** Set when the push service did not deliver to the test browser: then nothing after it says anything about the app. */
let undelivered = "";
/** Leaves the local stack and this machine as they were found. */
async function leave(code) {
  await context?.close().catch(() => undefined);
  await new Promise(resolve => server ? server.httpServer.close(resolve) : resolve());
  for (const child of children) child.kill();
  await db.query("delete from vault.secrets where name like 'push_worker%'").catch(() => undefined);
  for (const id of created) await admin.auth.admin.deleteUser(id).catch(() => undefined);
  await db.end().catch(() => undefined);
  rmSync(S, { recursive: true, force: true });
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { console.log(`\nstopped by ${signal}`); void leave(130); });
const run = randomBytes(4).toString("hex");

try {
  // The app, built as for production but for the local stack and with this run's public key.
  Object.assign(process.env, { VITE_SUPABASE_URL: api, VITE_SUPABASE_PUBLISHABLE_KEY: anonKey, VITE_WEB_PUSH_VAPID_PUBLIC_KEY: publicKey, VITE_APP_ORIGIN: origin, VITE_GOOGLE_CLIENT_ID: "", VITE_ENABLE_DEMO: "" });
  await build({ logLevel: "error", build: { outDir: `${S}/e2e-dist`, emptyOutDir: true } });
  server = await preview({ logLevel: "error", build: { outDir: `${S}/e2e-dist` }, preview: { host: "127.0.0.1", port: 54994, strictPort: true } });

  // The two functions, as they are in the repository, on Deno.
  for (const [name, port] of [["process-reminders", 54995], ["send-test-push", 54996]]) {
    // Without DENO_NO_PACKAGE_JSON, Deno looks for the functions' packages in this folder's node_modules.
    const child = spawn(deno, ["run", "-A", `supabase/functions/${name}/index.ts`], { env: {
      PATH: process.env.PATH, HOME: process.env.HOME, DENO_DIR: process.env.DENO_DIR, DENO_NO_PACKAGE_JSON: "1", DENO_SERVE_ADDRESS: `tcp:0.0.0.0:${port}`, NO_COLOR: "1",
      SUPABASE_URL: api, SUPABASE_ANON_KEY: anonKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey,
      CRON_SECRET: cronSecret, WEB_PUSH_VAPID_PUBLIC_KEY: publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: jwk.d, WEB_PUSH_CONTACT: "mailto:admin@gnouht.space",
    } });
    const log = createWriteStream(`${S}/${name}.log`); child.stdout.pipe(log); child.stderr.pipe(log);
    child.on("error", cause => log.write(`could not start "${deno}": ${cause.message}. Set DENO to the deno binary.\n`));
    children.push(child);
    const up = await until(() => fetch(`http://127.0.0.1:${port}/`, { method: "POST" }).then(answer => answer.status, () => 0), status => status > 0 || child.exitCode !== null || child.pid === undefined, 120_000);
    if (!check(up > 0, `${name} runs on Deno`, readFileSync(`${S}/${name}.log`, "utf8").slice(-300))) throw new Error("no function, no test");
  }
  // The worker checks who calls it.
  check((await fetch("http://127.0.0.1:54995/", { method: "POST", headers: { Authorization: "Bearer wrong" } })).status === 401, "the worker refuses a caller without the secret");

  // The database learns where the worker is.
  await db.query("delete from vault.secrets where name like 'push_worker%'");
  await db.query("select vault.create_secret($1, 'push_worker_url'), vault.create_secret($2, 'push_worker_secret')", ["http://host.docker.internal:54995/functions/v1/process-reminders", cronSecret]);

  // Two people who are not friends yet.
  const people = {};
  for (const [name, shown] of [["an", "An"], ["binh", "Bình"]]) {
    const email = `push-${name}-${run}@example.test`, password = randomBytes(24).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: shown } });
    if (error) throw error;
    created.push(data.user.id);
    const anon = createClient(api, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: signedIn, error: signInError } = await anon.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    const client = createClient(api, anonKey, { global: { headers: { Authorization: `Bearer ${signedIn.session.access_token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { error: profileError } = await client.from("profiles").update({ username: `push_${name}_${run}`, display_name: shown }).eq("id", data.user.id);
    if (profileError) throw profileError;
    people[name] = { id: data.user.id, client, session: signedIn.session, username: `push_${name}_${run}` };
  }
  const { an, binh } = people;

  // Bình's browser: a profile on disk (a private window gets no push), notifications allowed.
  context = await chromium.launchPersistentContext(`${S}/e2e-profile`, { channel: "chromium", headless: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce", args: ["--enable-unsafe-swiftshader"] });
  await context.grantPermissions(["notifications"], { origin });
  await context.addInitScript(session => { if (!localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", JSON.stringify(session)); }, binh.session);
  // The local stack does not run functions here; the app's call to send-test-push goes to the one on Deno.
  await context.route("**/functions/v1/send-test-push", route => route.continue({ url: "http://127.0.0.1:54996/functions/v1/send-test-push" }));
  let page = await context.newPage();
  const problems = []; page.on("pageerror", error => problems.push(String(error)));
  /** What the service worker is showing right now. */
  const shown = () => page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration())?.getNotifications() ?? []).map(n => ({ title: n.title, body: n.body, tag: n.tag, url: n.data?.url })));
  const clearShown = () => page.evaluate(async () => { for (const n of await (await navigator.serviceWorker.getRegistration())?.getNotifications() ?? []) n.close(); });
  const device = () => one("select id, label, language, last_success_at, last_error, failure_count from public.push_subscriptions where user_id = $1", [binh.id]);
  const queued = key => one("select status, attempts, last_error from public.reminders where idempotency_key like $1 and user_id = $2 order by due_at desc limit 1", [key, binh.id]);

  /** Bình opens the conversation, which is what reads its messages and removes its notification. */
  let conversationId;
  const opened = () => binh.client.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  await page.goto(`${origin}/me/settings`);
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Thông báo đẩy" }) });
  const setup = card.getByRole("list", { name: "Tình trạng thiết lập" });
  await setup.getByRole("listitem").first().waitFor({ timeout: 30_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  const before = await setup.innerText();
  check(before.includes("Bản ứng dụng này đã sẵn sàng gửi thông báo đẩy.") && before.includes("Bạn đã cho phép Gnouht gửi thông báo.") && before.includes("Thiết bị này chưa đăng ký nhận thông báo đẩy."), "settings: a build with the key, permission given, not signed up yet", before);

  // 1. Turning push on signs this browser up with a real push service.
  await card.getByRole("button", { name: "Bật thông báo đẩy" }).click();
  const turnedOn = await card.getByRole("status").innerText({ timeout: 30_000 }).catch(error => String(error));
  check(turnedOn === "Đã bật thông báo đẩy trên thiết bị này.", "turning push on", turnedOn);
  const row = await device();
  const endpoint = (await one("select endpoint from public.push_subscriptions where user_id = $1", [binh.id]))?.endpoint ?? "";
  check(row?.label === "Chrome · Linux" && row.language === "vi" && endpoint.startsWith("https://"), `the device is stored as "${row?.label}", language ${row?.language}, at ${new URL(endpoint || "https://none").host}`);
  check((await one("select push_enabled from public.notification_preferences where user_id = $1", [binh.id]))?.push_enabled === true, "push is on for the account");
  check(await card.getByText("Chrome · Linux · thiết bị này").isVisible(), "the list names this device");

  // 2. The test button: the function checks who asks, pushes, and the service worker shows it.
  await card.getByRole("button", { name: "Gửi thông báo thử" }).click();
  const accepted = "Đã gửi tới 1 thiết bị. Thông báo sẽ hiện trong vài giây.";
  const testedText = await until(() => card.getByRole("status").innerText().catch(() => ""), text => text.startsWith("Đã gửi tới"), 30_000);
  let seen = testedText === accepted ? await until(shown, list => list.some(n => n.tag === "test"), 60_000) : [];
  // Whether the push service serves this browser at all is not the app's doing, and is told apart from a failure.
  if (testedText.startsWith("Đã gửi tới 0/1")) undelivered = `the push service refused the test push (${(await card.getByRole("listitem").filter({ hasText: "Chrome · Linux" }).innerText().catch(() => "")).replace(/\s+/g, " ").trim() || "and the device left the list: 404 or 410"})`;
  else if (testedText === accepted && !seen.length) undelivered = "the push service took the test push, and nothing reached the browser within a minute";
  if (undelivered) throw new Error(undelivered);
  check(testedText === accepted, "the test push is accepted by the push service", testedText);
  check(seen.some(n => n.title === "Thông báo thử" && n.body === "Thiết bị này nhận được thông báo đẩy của Gnouht." && n.url === "/me/settings"), "the browser shows the test notification", JSON.stringify(seen));
  check(Boolean((await device())?.last_success_at), "the device remembers that a push went through");
  await clearShown();

  // 3. A real notification: An asks to be Bình's friend. The database writes it, calls the worker, the worker pushes.
  let started = Date.now();
  let { error } = await an.client.rpc("send_friend_request", { p_username: binh.username });
  check(!error, "An sends a friend request", error?.message);
  seen = await until(shown, list => list.length > 0);
  check(seen.length === 1 && seen[0].title === "Lời mời kết bạn" && seen[0].body === "Có người muốn kết nối với bạn.", `a friend request is pushed ${((Date.now() - started) / 1000).toFixed(1)} s after it was sent`, JSON.stringify(seen));
  const request = await until(() => one("select n.dedupe_key, n.action_path, r.status from public.notifications n join public.reminders r on r.idempotency_key = n.dedupe_key where n.user_id = $1 and n.category = 'friend_request'", [binh.id]), entry => entry?.status === "delivered", 10_000);
  check(request?.status === "delivered" && seen[0]?.url === request.action_path, `its queue entry is closed as delivered, and it opens ${request?.action_path}`, JSON.stringify(request));
  await clearShown();

  // 4. With the app closed. Only the browser is running; no page of the app is open.
  ({ error } = await binh.client.rpc("respond_friend_request", { p_requester_id: an.id, p_accept: true }));
  check(!error, "Bình accepts", error?.message);
  const { data: conversation, error: openError } = await an.client.rpc("open_direct_conversation", { p_user_id: binh.id });
  check(!openError && Boolean(conversation), "An opens a conversation with Bình", openError?.message);
  conversationId = typeof conversation === "string" ? conversation : conversation?.id ?? conversation?.[0]?.id;
  await page.close();
  started = Date.now();
  ({ error } = await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Đi cà phê không?" }));
  check(!error, "An writes to Bình", error?.message);
  const chat = await until(() => queued("chat:%"), entry => entry?.status === "delivered");
  check(chat?.status === "delivered", `the message is pushed while no page is open (${((Date.now() - started) / 1000).toFixed(1)} s)`, JSON.stringify(chat));
  page = await context.newPage(); page.on("pageerror", error => problems.push(String(error)));
  await page.goto(`${origin}/me/settings`);
  seen = await until(shown, list => list.some(n => n.title.startsWith("Tin nhắn mới")), 15_000);
  check(seen.some(n => n.title === "Tin nhắn mới · An" && n.body === "" && n.url === `/chat/${conversationId}`), "it was shown by the service worker alone, and carries no message text", JSON.stringify(seen));

  // 5. No second push for the same conversation while the first is unread.
  const pushesBefore = (await one("select count(*)::int as n from public.reminders where user_id = $1", [binh.id])).n;
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Alo?" });
  await sleep(4_000);
  seen = await shown();
  check((await one("select count(*)::int as n from public.reminders where user_id = $1", [binh.id])).n === pushesBefore && seen.filter(n => n.title.startsWith("Tin nhắn mới")).length === 1, "a second message in the unread conversation is not pushed again", JSON.stringify(seen));
  await clearShown();

  // 5a. Read in the inbox without opening the conversation: the next message is news again.
  await binh.client.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", binh.id).is("read_at", null);
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Còn đó không?" });
  seen = await until(shown, list => list.length > 0, 20_000);
  check(seen.length === 1 && seen[0].title === "Tin nhắn mới · An", "after the notification was marked read in the inbox, the next message is pushed again", JSON.stringify(seen));
  await clearShown();

  // 6. Tapping a notification takes the open app to what it is about.
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async url => {
    await self.registration.showNotification("x", { data: { url }, tag: "tap" });
    const [notification] = await self.registration.getNotifications({ tag: "tap" });
    self.dispatchEvent(new NotificationEvent("notificationclick", { notification }));
  }, `/chat/${conversationId}`).catch(cause => problems.push(`notificationclick: ${cause}`));
  const landed = await until(() => page.url(), url => url.endsWith(`/chat/${conversationId}`), 10_000);
  check(landed === `${origin}/chat/${conversationId}`, "a tap on a notification opens its screen in the app that is already open", landed);
  // A link that leaves the app is not followed.
  await worker.evaluate(async () => {
    await self.registration.showNotification("x", { data: { url: "//evil.example/x" }, tag: "tap2" });
    const [notification] = await self.registration.getNotifications({ tag: "tap2" });
    self.dispatchEvent(new NotificationEvent("notificationclick", { notification }));
  }).catch(cause => problems.push(`notificationclick: ${cause}`));
  const kept = await until(() => page.url(), url => url.endsWith("/notifications"), 10_000);
  check(kept === `${origin}/notifications`, "a link that would leave the app leads to the inbox instead", kept);
  // Opening the conversation marks it read, so the next message is news again.
  await opened();
  await clearShown();

  // 7. The app in English: the device says so when the app starts, and the next push is in English.
  await page.evaluate(() => localStorage.setItem("gnouht-language", "en"));
  await page.goto(`${origin}/me/settings`);
  check((await until(device, d => d?.language === "en", 15_000))?.language === "en", "the device tells the server its language when the app starts");
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Hello" });
  seen = await until(shown, list => list.length > 0);
  check(seen[0]?.title === "New message · An", "the push is written in the device's language", JSON.stringify(seen));
  await clearShown();
  await opened();

  // 8. A private preview says only that something arrived.
  const englishCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Push notifications" }) });
  await englishCard.getByLabel("Hide the content on the lock screen").check();
  await until(() => one("select private_previews from public.notification_preferences where user_id = $1", [binh.id]), p => p?.private_previews === true, 10_000);
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Secret" });
  seen = await until(shown, list => list.length > 0);
  check(seen[0]?.title === "Gnouht Together" && seen[0]?.body === "You have a new notification.", "with a private preview the push names nobody", JSON.stringify(seen));
  await clearShown();
  await opened();
  await db.query("update public.notification_preferences set private_previews = false where user_id = $1", [binh.id]);

  // 9. Quiet hours: the inbox gets it, the device does not.
  await db.query("update public.notification_preferences set quiet_start = (now() at time zone p.timezone)::time - interval '1 hour', quiet_end = (now() at time zone p.timezone)::time + interval '1 hour' from public.profiles p where p.id = user_id and user_id = $1", [binh.id]);
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Shh" });
  const quiet = await until(() => queued("chat:%"), entry => entry?.status === "delivered");
  await sleep(3_000);
  check(quiet?.status === "delivered" && (await shown()).length === 0 && (await one("select count(*)::int as n from public.notifications where user_id = $1 and read_at is null", [binh.id])).n === 1, "in quiet hours nothing is pushed, and the inbox still has it", JSON.stringify([quiet, await shown()]));
  await db.query("update public.notification_preferences set quiet_start = null, quiet_end = null where user_id = $1", [binh.id]);
  await opened();

  // 10. A kind that was turned off is not pushed.
  await db.query("update public.notification_preferences set category_push = '{\"chat_message\": false}' where user_id = $1", [binh.id]);
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Muted kind" });
  await until(() => queued("chat:%"), entry => entry?.status === "delivered");
  await sleep(3_000);
  check((await shown()).length === 0, "a kind that is turned off is not pushed", JSON.stringify(await shown()));
  await db.query("update public.notification_preferences set category_push = '{}' where user_id = $1", [binh.id]);
  await opened();

  // 11. A browser that gave its address up: the push service says so, and the device leaves the list.
  await page.evaluate(async () => (await (await navigator.serviceWorker.getRegistration()).pushManager.getSubscription()).unsubscribe());
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "Anyone?" });
  const gone = await until(device, d => !d, 30_000);
  // A push service may go on taking pushes for an address for a while after the browser gave it up.
  if (gone && !gone.last_error) skipped("an address the browser gave up is removed after the push service refuses it", "the push service still took a push for that address");
  else check(!gone, "an address the browser gave up is removed after the push service refuses it", JSON.stringify(gone));
  await db.query("delete from public.push_subscriptions where user_id = $1", [binh.id]);
  await page.reload();
  const englishSetup = await page.locator("section").filter({ has: page.getByRole("heading", { name: "Push notifications" }) }).getByRole("list").first().innerText();
  check(/not signed up/i.test(englishSetup), "the settings then say this device is not signed up", englishSetup);

  // 12. The server's key pair was replaced. A device signed up under the old one signs up again by itself when the app starts.
  const otherKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ format: "jwk" });
  const stale = await page.evaluate(async key => (await (await navigator.serviceWorker.getRegistration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })).toJSON(),
    Buffer.concat([Buffer.from([4]), Buffer.from(otherKey.x, "base64url"), Buffer.from(otherKey.y, "base64url")]).toString("base64url"));
  ({ error } = await binh.client.from("push_subscriptions").insert({ user_id: binh.id, endpoint: stale.endpoint, p256dh: stale.keys.p256dh, auth: stale.keys.auth }));
  check(!error, "a device signed up under another key pair is on the list", error?.message);
  await page.reload();
  const address = () => one("select endpoint, (select count(*)::int from public.push_subscriptions where user_id = $1) as devices from public.push_subscriptions where user_id = $1 limit 1", [binh.id]);
  const renewed = await until(address, now => Boolean(now) && now.endpoint !== stale.endpoint, 20_000);
  check(Boolean(renewed) && renewed.endpoint !== stale.endpoint && renewed.devices === 1, "after the key pair was replaced, the device signs up again when the app starts", JSON.stringify(renewed));
  await opened(); await clearShown();
  await an.client.rpc("send_message", { p_id: randomUUID(), p_conversation_id: conversationId, p_body: "New key" });
  seen = await until(shown, list => list.length > 0);
  check(seen[0]?.title === "New message · An", "and a push reaches it at its new address", JSON.stringify(seen));

  check(problems.length === 0, "no error on the page", problems.join(" | "));
  await context.close(); context = undefined;
  await db.query("delete from public.push_subscriptions where user_id = $1", [binh.id]);

  // 13. A browser that blocks notifications is told so, and cannot press the button.
  context = await chromium.launchPersistentContext(`${S}/e2e-profile2`, { channel: "chromium", headless: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce", args: ["--enable-unsafe-swiftshader", "--deny-permission-prompts"] });
  await context.addInitScript(session => { if (!localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", JSON.stringify(session)); }, binh.session);
  const blocked = await context.newPage();
  await blocked.goto(`${origin}/me/settings`);
  const blockedCard = blocked.locator("section").filter({ has: blocked.getByRole("heading", { name: "Thông báo đẩy" }) });
  await blockedCard.getByRole("list", { name: "Tình trạng thiết lập" }).getByRole("listitem").first().waitFor({ timeout: 30_000 });
  const permission = await blocked.evaluate(() => Notification.permission);
  const blockedText = await blockedCard.getByRole("list", { name: "Tình trạng thiết lập" }).innerText();
  if (permission === "denied") {
    check(blockedText.includes("Trình duyệt đang chặn thông báo của Gnouht.") && await blockedCard.getByRole("button", { name: "Bật thông báo đẩy" }).isDisabled(), "a browser that blocks notifications: the settings say how to unblock, the button is off", blockedText);
  } else {
    await blockedCard.getByRole("button", { name: "Bật thông báo đẩy" }).click();
    const refused = await blockedCard.getByRole("status").innerText({ timeout: 20_000 }).catch(cause => String(cause));
    check(refused === "Bạn chưa cấp quyền gửi thông báo.", `a person who does not allow notifications (permission "${permission}") is told so`, refused);
    check(!(await device()), "and no device is stored");
  }
} catch (cause) {
  if (!undelivered) { failed++; console.log("STOPPED:", cause); }
}
if (undelivered) {
  console.log(`\nNOT CHECKED: ${undelivered}\nThe push service did not deliver to the test browser, so what comes after could not be checked.\n`
    + "That is about the push service and this machine's way to it, not about the app. Try again later; signing up many times in an hour makes it refuse.");
  await leave(2);
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
await leave(failed ? 1 : 0);
