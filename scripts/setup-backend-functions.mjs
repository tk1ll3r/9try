import { generateKeyPairSync, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const projectRef = "jqmkfgmfisjmqizqyyct";
const contact = "mailto:admin@gnouht.space";

console.log("==> Generating VAPID keys and worker secret...");
const jwk = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ format: "jwk" });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url")]).toString("base64url");
const privateKey = jwk.d;
const workerSecret = randomBytes(32).toString("hex");

console.log(`Generated public key: ${publicKey.slice(0, 10)}...`);

// 1. Set secrets on Supabase
console.log("==> Setting Supabase Edge Function secrets...");
const tmpEnv = join(tmpdir(), `secrets-${Date.now()}.env`);
try {
  writeFileSync(
    tmpEnv,
    `CRON_SECRET=${workerSecret}\nWEB_PUSH_CONTACT=${contact}\nWEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}\nWEB_PUSH_VAPID_PRIVATE_KEY=${privateKey}\n`,
    { mode: 0o600 }
  );
  execSync(`npx -y supabase secrets set --env-file "${tmpEnv}" --project-ref ${projectRef}`, { stdio: "inherit" });
} finally {
  try { unlinkSync(tmpEnv); } catch {}
}

// 2. Deploy all edge functions
console.log("==> Deploying Edge Functions to new project...");
const functionsToDeploy = [
  { name: "delete-account", noVerifyJwt: false },
  { name: "calendar-feed", noVerifyJwt: true },
  { name: "process-reminders", noVerifyJwt: true },
  { name: "send-test-push", noVerifyJwt: false },
];

for (const fn of functionsToDeploy) {
  console.log(`Deploying ${fn.name}...`);
  const extraFlags = fn.noVerifyJwt ? "--no-verify-jwt" : "";
  execSync(`npx -y supabase functions deploy ${fn.name} ${extraFlags} --project-ref ${projectRef} --use-api`, { stdio: "inherit" });
}

// 3. Update vault
console.log("==> Updating vault secrets in database...");
const workerUrl = `https://${projectRef}.supabase.co/functions/v1/process-reminders`;
const vaultSql = `do $$
declare wanted record;
begin
  for wanted in select * from (values
    ('push_worker_url', '${workerUrl}'),
    ('push_worker_secret', '${workerSecret}')
  ) as v(name, secret) loop
    if exists(select 1 from vault.secrets where name = wanted.name) then
      perform vault.update_secret((select id from vault.secrets where name = wanted.name), wanted.secret);
    else
      perform vault.create_secret(wanted.secret, wanted.name);
    end if;
  end loop;
end $$;`;

const tmpSql = join(tmpdir(), `vault-${Date.now()}.sql`);
try {
  writeFileSync(tmpSql, vaultSql, { mode: 0o600 });
  execSync(`npx -y supabase db query --linked --project-ref ${projectRef} --file "${tmpSql}"`, { stdio: "inherit" });
} finally {
  try { unlinkSync(tmpSql); } catch {}
}

// 4. Test worker health directly
console.log("==> Testing process-reminders endpoint...");
let ok = false;
for (let i = 0; i < 10; i++) {
  try {
    const res = await fetch(workerUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}` }
    });
    const text = await res.text();
    console.log(`Worker responded [${res.status}]: ${text.slice(0, 100)}`);
    if (res.status === 200) {
      ok = true;
      break;
    }
  } catch (err) {
    console.log(`Attempt ${i + 1} failed: ${err.message}`);
  }
  await sleep(3000);
}

if (!ok) {
  throw new Error("Worker failed to answer with 200 OK");
}

// 5. Test kick_push_worker from DB
console.log("==> Testing kick_push_worker via pg_net...");
const kickSql = `select coalesce((select max(id) from net._http_response), 0) as last_id, private.kick_push_worker() is null as kicked;`;
const tmpKickSql = join(tmpdir(), `kick-${Date.now()}.sql`);
try {
  writeFileSync(tmpKickSql, kickSql, { mode: 0o600 });
  execSync(`npx -y supabase db query --linked --project-ref ${projectRef} --file "${tmpKickSql}"`, { stdio: "inherit" });
} finally {
  try { unlinkSync(tmpKickSql); } catch {}
}

await sleep(3000);
const verifyKickSql = `select id, status_code, error_msg from net._http_response order by id desc limit 3;`;
const tmpVerifySql = join(tmpdir(), `verify-${Date.now()}.sql`);
try {
  writeFileSync(tmpVerifySql, verifyKickSql, { mode: 0o600 });
  execSync(`npx -y supabase db query --linked --project-ref ${projectRef} --file "${tmpVerifySql}"`, { stdio: "inherit" });
} finally {
  try { unlinkSync(tmpVerifySql); } catch {}
}

// 6. Update .env.local
console.log("==> Updating .env.local with VAPID public key...");
let envLocal = readFileSync(".env.local", "utf8");
if (/^VITE_WEB_PUSH_VAPID_PUBLIC_KEY=.*$/m.test(envLocal)) {
  envLocal = envLocal.replace(/^VITE_WEB_PUSH_VAPID_PUBLIC_KEY=.*$/m, `VITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`);
} else {
  envLocal += `\nVITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}\n`;
}
writeFileSync(".env.local", envLocal);

console.log("==> All Edge Functions, secrets, vault, and push configuration completed successfully!");
