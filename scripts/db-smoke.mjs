// Applies every migration and runs the pgTAP files on an embedded Postgres (PGlite), so the
// database tests can run without Docker: `npm run test:db`, or `npm run test:db -- location`
// for one file. This is a smoke check with stand-ins for the Supabase roles, auth.uid(),
// pg_cron and pgTAP. `supabase test db` on a real local stack stays the authority.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync, readdirSync } from "node:fs";

const repo = new URL("..", import.meta.url).pathname;
const only = process.argv[2];
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
  -- pgTAP stand-in for the five functions the tests use.
  create function extensions.plan(n integer) returns text language sql as $$ select '1..' || n $$;
  create function extensions.is(have anyelement, want anyelement, description text) returns text language sql as $$
    select case when have is not distinct from want then 'ok - ' || description
      else 'not ok - ' || description || ' (have ' || coalesce(have::text, 'NULL') || ', want ' || coalesce(want::text, 'NULL') || ')' end $$;
  create function extensions.lives_ok(code text, description text) returns text language plpgsql as $$
    begin execute code; return 'ok - ' || description;
    exception when others then return 'not ok - ' || description || ' (' || sqlstate || ': ' || sqlerrm || ')'; end $$;
  create function extensions.throws_ok(code text, errcode text, errmsg text, description text) returns text language plpgsql as $$
    begin execute code; return 'not ok - ' || description || ' (no error)';
    exception when others then
      if sqlstate = errcode and sqlerrm = errmsg then return 'ok - ' || description; end if;
      return 'not ok - ' || description || ' (got ' || sqlstate || ': ' || sqlerrm || ')'; end $$;
  create function extensions.finish() returns setof text language sql as $$ select 'finish'::text where false $$;
  set search_path = "$user", public, extensions;
`);

for (const file of readdirSync(`${repo}supabase/migrations`).sort()) {
  try { await db.exec(readFileSync(`${repo}supabase/migrations/${file}`, "utf8")); console.log("migrated", file); }
  catch (error) { console.log("MIGRATION FAILED", file, "→", error.message); process.exit(1); }
}

let failed = 0;
for (const file of readdirSync(`${repo}supabase/tests/database`).sort()) {
  if (only && !file.includes(only)) continue;
  const sql = readFileSync(`${repo}supabase/tests/database/${file}`, "utf8").replace(/create extension if not exists pgtap[^;]*;/, "");
  let lines = [];
  try {
    for (const result of await db.exec(sql)) for (const row of result.rows) {
      const value = Object.values(row)[0];
      if (typeof value === "string" && /^(ok|not ok|1\.\.)/.test(value)) lines.push(value);
    }
  } catch (error) { lines.push(`not ok - file aborted: ${error.message}`); await db.exec("rollback; reset role;"); }
  const bad = lines.filter(line => line.startsWith("not ok"));
  const planned = Number(lines.find(line => line.startsWith("1.."))?.slice(3));
  const ran = lines.filter(line => /^(ok|not ok) - /.test(line)).length;
  if (ran !== planned) bad.push(`not ok - planned ${planned} assertions, ran ${ran}`);
  failed += bad.length;
  console.log(`${bad.length ? "FAIL" : "pass"} ${file}: ${ran}/${planned}`);
  for (const line of bad) console.log("   ", line);
}
process.exit(failed ? 1 : 0);
