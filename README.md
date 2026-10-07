# Gnouht Together

Vietnamese-first social planning and personal organization web app for trusted friends and families.

## Current implementation

- React 19 + TypeScript 7 + Vite 8 + Tailwind 4.
- Supabase magic-link authentication and user profiles.
- Friend requests: send, accept, decline, cancel, remove and block.
- Groups: create, invite links with expiry/use limits, join, leave, transfer ownership, remove members and archive.
- Meetups: proposal, invitees, time polling, atomic RSVP capacity enforcement, confirmation, discussion and cancellation.
- Calendar:
  - timed and all-day events,
  - private by default,
  - explicit selected-friend/group/public audiences,
  - free/busy sharing without leaking event details,
  - daily/weekly/monthly recurrence,
  - per-occurrence exceptions,
  - edit one occurrence or the whole series,
  - timezone-safe expansion using Temporal.
- Personal organizer: tasks, notes, routines and durable server-side reminders.
- In-app notification center plus optional Web Push with quiet hours/category preferences.
- Expiring location sharing:
  - explicit recipients,
  - approximate mode,
  - throttled updates,
  - stale-state display,
  - latest-position-only storage,
  - immediate revocation/deletion on stop.
- Personal data export and guarded account deletion.
- Installable PWA with static-shell caching only; private Supabase/location API responses are not cached by Workbox.
- Versioned Supabase schema, indexes, RLS policies, security-definer RPCs and Edge Functions.
- GitHub Actions validation for typecheck, unit tests and production build.

## Architecture

Features on the new structure live in `src/modules/<name>` with domain, application, infrastructure and presentation layers, and are listed in `src/app/modules.ts`. Tasks and notifications are there today. The other pages are still under `src/features` and move over phase by phase.

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

See:
- `docs/architecture.md`
- `docs/permission-matrix.md`
- `docs/deployment.md`
- `docs/backup-restore.md`
- `docs/cost-and-limits.md`
- `docs/master-plan.md` (the current plan: architecture, UX, features, phases)
- `docs/module-guide.md` (how to add or move a module)
- `docs/implementation-progress.md` (what is implemented, with evidence and open checks)

## Run locally

```bash
cp .env.example .env.local
npm ci
npm run dev
```

For an isolated **local** backend (Docker required), run `npx supabase@2.119.0 start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` in another terminal (lightweight mode; account-deletion Edge Function, reminders and realtime are not available in this mode). All migrations are applied automatically. Set `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the local **PUBLISHABLE_KEY** from `npx supabase@2.119.0 status --output env`. Open `http://127.0.0.1:5173` for the app; magic-link emails arrive in Mailpit at `http://127.0.0.1:55324` (configured port). Restart Vite after editing `.env.local`. Never put SECRET_KEY, SERVICE_ROLE_KEY or JWT_SECRET in `VITE_*` variables; never paste CLI status output in public logs.

To stop local containers: `npx supabase@2.119.0 stop`. For cloud testing instead, apply every migration in `supabase/migrations/` in order and configure the cloud URL/publishable key; activity modes need migrations 0011–0012 and direct location publishing requires policy fix 0013. Migrations 0013–0016 have **not been applied to cloud**. Do not run `supabase db reset --linked` on the cloud project.

## Validate

Node 22.12 or newer is required (`.nvmrc`); Vite 8 and Vitest 4 do not start on Node 18.

```bash
npm run typecheck
npm test                  # unit tests and the architecture rules
npm run test:db           # every migration + pgTAP files on an embedded Postgres, no Docker
npm run build
npm run test:e2e          # isolated mocked-browser UI tests; needs Playwright Chromium
npm run test:e2e:preview  # same suite against the production build
```

For a **fictional two-person map demo** in development, open `/demo/location` (An and Bình, public-place markers). It requires no Auth/GPS and never writes to Supabase; it does not verify real user privacy. The production build omits this route unless `VITE_ENABLE_DEMO=true` is deliberately set at build time. See `docs/implementation-progress.md` for the separate disposable **real-Auth two-browser-context** local test and its strict local-only safety guard.

SQL privacy tests require a disposable local Supabase Postgres and Docker access:

```bash
npx supabase@2.119.0 db start
npx supabase@2.119.0 test db supabase/tests/database
```

Do not run database tests against production. GitHub Actions now has a separate DB job; the new job has not yet been verified on CI. Earlier commits passed the typecheck, unit tests and build workflow on Node 24.

## Production

Deploy `dist/` to Cloudflare and bind `gnouht.space`.

Do **not** modify the existing `mcp.gnouht.space` DNS record, tunnel route or Cloudflare Access policy.

External setup is intentionally not faked. Production still requires:
- Supabase project URL + publishable key,
- applying migrations,
- deploying Edge Functions,
- cron authorization for reminder processing,
- VAPID keys for Web Push,
- Cloudflare project/custom-domain binding for `gnouht.space`.

The app does not expose service-role or VAPID private keys to browser code.
