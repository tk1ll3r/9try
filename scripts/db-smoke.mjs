// Runs the pgTAP files in supabase/tests/database.
//
//   npm run test:db              on an embedded Postgres (PGlite): applies every migration first, with
//                                stand-ins for the Supabase roles, auth.uid(), pg_cron, realtime and pgTAP.
//                                Needs no Docker. A smoke check.
//   npm run test:db:local        on the local Supabase stack's own Postgres, with the real pgTAP. The
//                                migrations must already be applied there (`supabase migration up --local`).
//   npm run test:db -- location  one file, in either mode.
//
// Every test file opens a transaction and rolls it back, so a run leaves no data behind.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";

const repo = new URL("..", import.meta.url).pathname;
const args = process.argv.slice(2);
const url = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
const only = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--url");

/** The local stack's Postgres. Refuses any other host: these tests insert users and must never reach a real project. */
async function realDatabase() {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname)) {
    console.log("Refusing to run: --url must point at 127.0.0.1 or localhost."); process.exit(2);
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  return {
    run: async sql => [await client.query(sql)].flat().map(result => result.rows),
    recover: () => client.query("rollback; reset role;"),
    close: () => client.end(),
  };
}

/** PGlite with what the migrations expect from a Supabase database, and every migration applied. */
async function embeddedDatabase() {
const db = new PGlite({ extensions: { pgcrypto } });

// The parts of a Supabase database that the migrations rely on.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema extensions; create schema cron;
  create extension pgcrypto with schema extensions;
  create table auth.users(id uuid primary key, instance_id uuid, aud text, role text, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  -- pg_cron stand-in: same call shape, records the job.
  create table cron.job(jobid serial primary key, jobname text unique, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job(jobname, schedule, command) values (job_name, schedule, command)
    on conflict(jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  -- Realtime stand-in: realtime.send records the event the way Supabase stores broadcasts.
  create schema realtime;
  create table realtime.messages(id bigserial primary key, topic text, extension text default 'broadcast', event text, payload jsonb, private boolean);
  alter table realtime.messages enable row level security;
  create function realtime.topic() returns text language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
  create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$
    insert into realtime.messages(topic, event, payload, private) values (topic, event, payload, private) $$;
  -- pgTAP stand-in for the functions the tests use.
  create function extensions.plan(n integer) returns text language sql as $$ select '1..' || n $$;
  create function extensions.is(have anyelement, want anyelement, description text) returns text language sql as $$
    select case when have is not distinct from want then 'ok - ' || description
      else 'not ok - ' || description || ' (have ' || coalesce(have::text, 'NULL') || ', want ' || coalesce(want::text, 'NULL') || ')' end $$;
  create function extensions.isnt(have anyelement, want anyelement, description text) returns text language sql as $$
    select case when have is distinct from want then 'ok - ' || description else 'not ok - ' || description || ' (both ' || coalesce(have::text, 'NULL') || ')' end $$;
  create function extensions.ok(passed boolean, description text) returns text language sql as $$
    select case when passed then 'ok - ' || description else 'not ok - ' || description end $$;
  create function extensions.lives_ok(code text, description text) returns text language plpgsql as $$
    begin execute code; return 'ok - ' || description;
    exception when others then return 'not ok - ' || description || ' (' || sqlstate || ': ' || sqlerrm || ')'; end $$;
  create function extensions.throws_ok(code text, errcode text, errmsg text, description text) returns text language plpgsql as $$
    begin execute code; return 'not ok - ' || description || ' (no error)';
    exception when others then
      if sqlstate = errcode and (errmsg is null or sqlerrm = errmsg) then return 'ok - ' || description; end if;
      return 'not ok - ' || description || ' (got ' || sqlstate || ': ' || sqlerrm || ')'; end $$;
  create function extensions.finish() returns setof text language sql as $$ select 'finish'::text where false $$;
  set search_path = "$user", public, extensions;
`);

for (const file of readdirSync(`${repo}supabase/migrations`).sort()) {
  try { await db.exec(readFileSync(`${repo}supabase/migrations/${file}`, "utf8")); console.log("migrated", file); }
  catch (error) { console.log("MIGRATION FAILED", file, "→", error.message); process.exit(1); }
}

  return {
    run: async sql => (await db.exec(sql)).map(result => result.rows),
    recover: () => db.exec("rollback; reset role;"),
    close: async () => {},
  };
}

const db = url ? await realDatabase() : await embeddedDatabase();
let failed = 0;
for (const file of readdirSync(`${repo}supabase/tests/database`).sort()) {
  if (only && !file.includes(only)) continue;
  // The embedded Postgres has its pgTAP stand-in already; the real one installs pgTAP inside the transaction.
  const sql = readFileSync(`${repo}supabase/tests/database/${file}`, "utf8");
  let lines = [];
  try {
    for (const rows of await db.run(url ? sql : sql.replace(/create extension if not exists pgtap[^;]*;/, ""))) for (const row of rows) {
      const value = Object.values(row)[0];
      if (typeof value === "string" && /^(ok|not ok|1\.\.)/.test(value)) lines.push(value);
    }
  } catch (error) { lines.push(`not ok - file aborted: ${error.message}`); await db.recover(); }
  const bad = lines.filter(line => line.startsWith("not ok"));
  const planned = Number(lines.find(line => line.startsWith("1.."))?.slice(3));
  const ran = lines.filter(line => /^(ok|not ok)\b/.test(line)).length;
  if (ran !== planned) bad.push(`not ok - planned ${planned} assertions, ran ${ran}`);
  failed += bad.length;
  console.log(`${bad.length ? "FAIL" : "pass"} ${file}: ${ran}/${planned}`);
  for (const line of bad) console.log("   ", line);
}
await db.close();
process.exit(failed ? 1 : 0);
