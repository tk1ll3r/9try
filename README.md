# Gnouht Together

Vietnamese-first social planning and personal organization web app for trusted friends and families.

## Current implementation

- React 19 + TypeScript 7 + Vite 8 + Tailwind 4, TanStack Query, Supabase.
- Sign-in by emailed link or 6-digit code; profiles.
- Friends: requests, invite links, block and unblock.
- Groups: roles, invite links with expiry and use limits, ownership transfer, archive.
- Chat between friends and inside groups, with unread counts.
- Meetups: proposal, time poll, RSVP with capacity enforced on the server, discussion, one page per meetup. A meetup in a group invites every member, and a confirmed one shows on the calendar.
- Calendar: timed and all-day events, daily/weekly/monthly repeats with per-occurrence exceptions, private by default, sharing with chosen friends or a group, `.ics` import and export, and a private feed address for Google or Apple Calendar.
- Timetable of weekly classes, and "Rảnh lúc nào?" to find times when chosen friends are all free.
- A Today screen that every feature adds a card to: requests waiting for an answer, what comes next, tasks, habits, what friends are doing.
- Tasks with labels (typed as `#nhãn`), an optional due time and sections by due date; habits with streaks; notes; reminders sent by the server.
- Live friend map: time-limited sharing with chosen friends, exact or approximate, latest position only, deleted on stop.
- Status modes that friends can see for a chosen time.
- Notification center, with optional Web Push, quiet hours and per-category choices.
- A privacy screen that lists what other people can see right now, with a stop button for each.
- Search across the app (Ctrl/Cmd+K).
- Data export and guarded account deletion.
- Installable PWA. The service worker caches the app shell only; Supabase and location responses are never cached.

`docs/implementation-progress.md` says what is verified and what is not. Migrations 0013–0026 are not applied to the cloud project yet.

## Architecture

`src/app` puts the app together, `src/kernel` holds what every feature shares, and each feature is a folder in `src/modules` with domain, application, infrastructure and presentation layers. A feature joins the app through one line in `src/app/modules.ts`.

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

See:
- `docs/architecture.md`
- `docs/module-guide.md` (how to add a module)
- `docs/implementation-progress.md` (what is implemented, with evidence and open checks)
- `docs/master-plan.md` (the plan: architecture, UX, features, phases)
- `docs/permission-matrix.md`
- `docs/deployment.md`
- `docs/backup-restore.md`
- `docs/cost-and-limits.md`

## Run locally

```bash
cp .env.example .env.local
npm ci
npm run dev
```

For an isolated **local** backend (Docker required), run `npx supabase@2.119.0 start --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` in another terminal (lightweight mode; account-deletion Edge Function, reminders and realtime are not available in this mode). All migrations are applied automatically. Set `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the local **PUBLISHABLE_KEY** from `npx supabase@2.119.0 status --output env`. Open `http://127.0.0.1:5173` for the app; magic-link emails arrive in Mailpit at `http://127.0.0.1:55324` (configured port). Restart Vite after editing `.env.local`. Never put SECRET_KEY, SERVICE_ROLE_KEY or JWT_SECRET in `VITE_*` variables; never paste CLI status output in public logs.

To stop local containers: `npx supabase@2.119.0 stop`. For cloud testing instead, apply every migration in `supabase/migrations/` in order and configure the cloud URL/publishable key; the app expects all of them. Migrations 0013–0026 have **not been applied to cloud**; `docs/implementation-progress.md` lists which features show errors until they are. Do not run `supabase db reset --linked` on the cloud project.

## Validate

Node 22.12 or newer is required (`.nvmrc`); Vite 8 and Vitest 4 do not start on Node 18.

```bash
npm run typecheck
npm test                  # unit tests, the architecture rules, the calendar-feed handler
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
- deploying the Edge Functions (`process-reminders`, `delete-account`, `calendar-feed`),
- the sign-in email template with the 6-digit code,
- cron authorization for reminder processing,
- VAPID keys for Web Push,
- Cloudflare project/custom-domain binding for `gnouht.space`.

The app does not expose service-role or VAPID private keys to browser code.
