import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  throw new Error("Node 22.12 or newer is required to deploy.");
}

function run(command, args, { env = process.env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const childEnv = { ...env };
    // `npx -p node@22` sets these for its own command; nested npm commands misread them.
    delete childEnv.npm_config_package;
    delete childEnv.npm_config_call;
    const child = spawn(command, args, { env: childEnv, stdio: capture ? ["ignore", "pipe", "ignore"] : "inherit" });
    let stdout = "";
    if (capture) child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.once("error", () => reject(new Error(`Could not start ${command}.`)));
    child.once("close", code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited with status ${code}.`)));
  });
}

let projectRef = process.env.SUPABASE_PROJECT_REF;
if (!projectRef) {
  try { projectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim(); } catch { /* Explain the missing link below. */ }
}
if (!/^[a-z0-9]{20}$/.test(projectRef ?? "")) {
  throw new Error("Link this folder to its Supabase project or set SUPABASE_PROJECT_REF.");
}

// The browser needs this public key. Read it from the linked project at deploy time so a local
// .env.local can never point the production build at localhost. Keep it in memory and off logs.
const keyOutput = await run("npx", ["--yes", "supabase@2.120.0", "projects", "api-keys", "--project-ref", projectRef, "--output", "json"], { capture: true });
let publishableKey;
try {
  publishableKey = JSON.parse(keyOutput).find(item => item.type === "publishable")?.api_key;
} catch { /* Report a generic configuration error below. */ }
if (!publishableKey) throw new Error("Supabase did not return a publishable API key for the linked project.");

const env = {
  ...process.env,
  VITE_SUPABASE_URL: `https://${projectRef}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
};
await run("npm", ["run", "build"], { env });

const dryRun = process.argv.includes("--dry-run");
await run("npx", ["--yes", "wrangler@4", "deploy", ...(dryRun ? ["--dry-run"] : [])], { env });
