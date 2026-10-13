// Turns push notifications on, for the linked Supabase project and for the web app built from this folder.
//
//   npm run push:setup                 everything below
//   npm run push:setup -- --new-keys   also replaces a key pair that is already there. A device then
//                                      gets no push until its app is opened once with the new build.
//
// One run does what docs/deployment.md, "Push notifications", describes:
//   1. makes the key pair that browsers and the server share (VAPID), unless the project has the one
//      whose public half is in .env.local, and a new secret between the database and the worker;
//   2. sets them as secrets of the Edge Functions, and deploys the two functions that send pushes,
//      so that they are this folder's version and start with the new secrets;
//   3. stores the worker's address and that secret in the database's vault;
//   4. asks the worker, and then the database, whether the three now agree;
//   5. writes the public key into .env.local and deploys the web app, which has that key built in.
//
// No secret is printed, and none is written into this folder. The private key and the worker's secret
// exist in this process and in two files in the system's temporary folder, which are deleted before
// it ends; after that only Supabase has them. Running it again is safe: it keeps the key pair.
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

process.chdir(new URL("..", import.meta.url).pathname);
// The CLI and the build run on the Node that runs this script.
process.env.PATH = dirname(process.execPath) + delimiter + process.env.PATH;

/** Every secret made here, so that it can be blanked in whatever is printed. */
const made = [];
const blanked = text => made.reduce((shown, secret) => shown.replaceAll(secret, "***"), String(text));
function stop(message) {
  console.error(`\n${blanked(message)}`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "gnouht-push-"));
process.on("exit", () => rmSync(work, { recursive: true, force: true }));
process.on("SIGINT", () => process.exit(130));
/** A file only this account can read, gone when the script ends. */
function secretFile(name, text) {
  writeFileSync(join(work, name), text, { mode: 0o600 });
  return join(work, name);
}

/** Runs the Supabase CLI and gives back what it printed. Its output is kept off the screen: it can repeat what it was sent. */
function supabase(...args) {
  const result = spawnSync("npx", ["--yes", "supabase@2.119.0", ...args], { encoding: "utf8" });
  if (result.status !== 0) stop(`"supabase ${args.slice(0, 2).join(" ")}" failed:\n${[result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n").trim()}`);
  return result.stdout;
}
/**
 * For the calls whose answer is read. `--agent yes` makes the CLI answer in one form wherever this is
 * run from: the form the cloud project's answers were read in when this was written.
 */
const asJson = ["--agent", "yes", "--output-format", "json"];
/** The list in the CLI's answer: by itself, or under `key` when the CLI wraps it. */
function listIn(output, key) {
  try {
    const answer = JSON.parse(output);
    const list = Array.isArray(answer) ? answer : answer?.[key];
    if (Array.isArray(list)) return list;
  } catch { /* said below */ }
  return stop("The Supabase CLI answered in a form this script does not know. It was written for supabase@2.119.0.");
}
/** Runs one SQL statement on the linked project's database. `rows` reads what it returned. */
const sql = text => supabase("db", "query", "--linked", "--file", secretFile("query.sql", text), ...asJson);
const rows = text => listIn(sql(text), "rows");

// Where things stand. Nothing is changed before all of this is read.
let ref;
let env;
try {
  ref = readFileSync("supabase/.temp/project-ref", "utf8").trim();
  env = readFileSync(".env.local", "utf8");
} catch (cause) {
  stop(`${cause.message}\nThis needs a linked project ("npx supabase@2.119.0 link") and the app's settings in .env.local.`);
}
if (!/^[a-z0-9]{20}$/.test(ref)) stop("supabase/.temp/project-ref does not hold a project ref.");
const setting = name => env.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1].trim() ?? "";
if (!setting("VITE_SUPABASE_URL").includes(ref)) stop(`.env.local builds the app for another Supabase project than the one the CLI is linked to (${ref}). Nothing was changed.`);
const contact = setting("WEB_PUSH_CONTACT") || "mailto:admin@gnouht.space";
if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(contact)) stop("WEB_PUSH_CONTACT in .env.local must be a mailto: address or an https:// address. Push services refuse anything else.");

// The CLI shows each secret as the SHA-256 of its value, which is enough to tell whether two values are the same.
const onProject = Object.fromEntries(listIn(supabase("secrets", "list", ...asJson), "secrets").map(secret => [secret.name, secret.value]));
const digest = value => createHash("sha256").update(value).digest("hex");
// Checked on a value that is known, so that a CLI which lists secrets differently cannot make a kept key pair look absent.
if (onProject.SUPABASE_URL !== digest(`https://${ref}.supabase.co`)) stop("The secrets the Supabase CLI lists are not those of the linked project, or not in the form this script knows (supabase@2.119.0). Nothing was changed.");

let publicKey = setting("VITE_WEB_PUSH_VAPID_PUBLIC_KEY");
const hasPair = Boolean(onProject.WEB_PUSH_VAPID_PUBLIC_KEY && onProject.WEB_PUSH_VAPID_PRIVATE_KEY);
const samePair = hasPair && Boolean(publicKey) && onProject.WEB_PUSH_VAPID_PUBLIC_KEY === digest(publicKey);
const newPair = !hasPair || process.argv.includes("--new-keys");
if (!newPair && !samePair) {
  stop("The project already has a push key pair, but VITE_WEB_PUSH_VAPID_PUBLIC_KEY in .env.local is not its public half.\n"
    + "Put that public key into .env.local and run this again. If the key is lost, run it with --new-keys:\n"
    + "that replaces the pair, and a device then gets no push until its app is opened once with the new build.\n"
    + "Nothing was changed.");
}

// 1. The key pair and the worker's secret.
const workerSecret = randomBytes(32).toString("hex");
made.push(workerSecret);
const secrets = { CRON_SECRET: workerSecret, WEB_PUSH_CONTACT: contact };
if (newPair) {
  const jwk = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
  made.push(jwk.d);
  // The forms browsers and the web-push library take: the public point uncompressed (65 bytes), the private number (32 bytes), both base64url.
  publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
  Object.assign(secrets, { WEB_PUSH_VAPID_PUBLIC_KEY: publicKey, WEB_PUSH_VAPID_PRIVATE_KEY: jwk.d });
  // Written before the private half is sent away: the project never gives the public half back.
  const line = `VITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`;
  env = /^VITE_WEB_PUSH_VAPID_PUBLIC_KEY=.*$/m.test(env) ? env.replace(/^VITE_WEB_PUSH_VAPID_PUBLIC_KEY=.*$/m, line) : `${env.trimEnd()}\n${line}\n`;
  writeFileSync(".env.local", env);
  console.log(`${hasPair ? "Replaced" : "Made"} the push key pair. Its public half is in .env.local.`);
} else {
  console.log("Kept the push key pair the project already has.");
}

// 2. The functions' secrets.
supabase("secrets", "set", "--env-file", secretFile("secrets.env", Object.entries(secrets).map(([name, value]) => `${name}=${value}\n`).join("")));
console.log(`Set the functions' secrets: ${Object.keys(secrets).join(", ")}.`);
supabase("functions", "deploy", "process-reminders", "send-test-push", "--use-api");
console.log("Deployed process-reminders and send-test-push.");

// 3. The vault: where the worker is, and the secret it expects. An entry that is there is replaced.
const worker = `https://${ref}.supabase.co/functions/v1/process-reminders`;
sql(`do $$
declare wanted record;
begin
  for wanted in select * from (values ('push_worker_url', '${worker}'), ('push_worker_secret', '${workerSecret}')) as v(name, secret) loop
    if exists(select 1 from vault.secrets where name = wanted.name) then
      perform vault.update_secret((select id from vault.secrets where name = wanted.name), wanted.secret);
    else
      perform vault.create_secret(wanted.secret, wanted.name);
    end if;
  end loop;
end $$;`);
console.log("Stored the worker's address and secret in the database's vault.");

// 4. Do they agree? First the worker by itself. A function that was just deployed can take a while to answer, so it gets a minute.
console.log("Asking the worker…");
let answer;
for (let attempt = 0; attempt < 12; attempt++) {
  if (attempt) await sleep(5_000);
  answer = await fetch(worker, { method: "POST", headers: { Authorization: `Bearer ${workerSecret}` } })
    .then(async response => ({ status: response.status, text: (await response.text()).slice(0, 200) }), cause => ({ status: 0, text: String(cause.cause?.message ?? cause.message) }));
  if (answer.status === 200) break;
}
if (answer.status !== 200) {
  const why = {
    0: "It could not be reached from this computer.",
    401: "It does not have the new secret, or it runs with the platform's sign-in check on (supabase/config.toml turns that off).",
    404: "It is not there, although the deploy reported no error.",
    503: "It does not see the three WEB_PUSH_* secrets.",
  }[answer.status] ?? "";
  stop(`The worker answered ${answer.status}: ${answer.text}\n${why}\nThe secrets and the vault are set. Running this again is safe; it keeps the key pair.`);
}
console.log(`The worker answered: ${answer.text}`);

// Then the database calling the worker, as it does for every notification and once a minute.
const last = Number(rows("select coalesce((select max(id) from net._http_response), 0) as last, private.kick_push_worker() is null as kicked")[0]?.last ?? 0);
let call;
for (let attempt = 0; attempt < 8 && call?.status_code !== 200; attempt++) {
  await sleep(3_000);
  call = rows(`select status_code, error_msg from net._http_response where id > ${last} order by (status_code = 200) desc nulls last, id desc limit 1`)[0];
}
if (call?.status_code !== 200) {
  stop(`The worker is fine, but the database's own call to it ${call ? `ended with: ${call.status_code ?? call.error_msg ?? "no answer"}` : "left no trace within 25 seconds. The pg_net extension may be off (Database → Extensions)"}.\n`
    + "Run this again once that is fixed; it keeps the key pair.");
}
console.log("The database reached the worker.");

// 5. The web app, with the public key built in.
console.log("\nBuilding and deploying the web app…\n");
if (spawnSync("npm", ["run", "deploy"], { stdio: "inherit" }).status !== 0) {
  stop("Push is set up on the server, but the web app was not deployed, so it does not have the key yet.\n"
    + "Run \"npm run deploy\" when the cause above is fixed (for a sign-in problem: npx wrangler@4 login).");
}
if (!readdirSync("dist/assets").some(file => file.endsWith(".js") && readFileSync(join("dist/assets", file), "utf8").includes(publicKey))) {
  stop("The app was deployed, but the build does not contain the push key. Check VITE_WEB_PUSH_VAPID_PUBLIC_KEY in .env.local.");
}

console.log(`
Push is on. To see it work: open the app on a phone, reload once, then
Cài đặt → Thông báo đẩy → "Bật thông báo đẩy" → "Gửi thông báo thử".
On iPhone and iPad the app has to be added to the Home Screen first.`);
