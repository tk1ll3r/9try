# Gnouht Together

Live app: https://9try.gnouht.space

Vietnamese-first social planning and personal organization web app for trusted friends and families.

## Current implementation

- React 19 + TypeScript 7 + Vite 8 + Tailwind 4, TanStack Query, Supabase.
- Sign-in with Google (once it is turned on in Supabase), by emailed link or by 6-digit code; profiles.
- Friends: requests, invite links, block and unblock.
- Groups: roles, invite links with expiry and use limits, ownership transfer, archive.
- A page for visitors who are not signed in, with drawings of what the app is and does.
- Chat between friends and inside groups, with unread counts: replies, reactions, edit within 15 minutes, unsend, "Đã xem", typing, photos, cards that open an event, a location or a photo, search and mute.
- Photos of the day on the Mode screen, for all friends or chosen ones, deleted after 24 hours.
- Calendar, drawn by the app itself: a week list, a month and an hour grid, with a color for classes, events and a friend's busy times. Timed and all-day events, daily/weekly/monthly repeats with per-occurrence exceptions, private by default, sharing with chosen friends or a group (changeable later), `.ics` import (repeating events and timetables included) and export, and a private feed address for Google or Apple Calendar.
- Timetable of weekly classes; habits with streaks; notes; reminders that the database puts into the inbox when they are due.
- Live friend map in the app's own colors, with friends as faces: time-limited sharing with chosen friends, exact or approximate, latest position only, deleted on stop.
- Mode, the home screen: what each friend says they are doing right now, with the friends who matter most at the moment on top (unread messages, a live location, a pin) and the reason on each card. Your own mode is one tap.
- Notification center, with optional Web Push, quiet hours and per-category choices.
- A privacy screen that lists what other people can see right now, with a stop button for each.
- Vietnamese and English. The language is chosen in the account menu or on the sign-in screen.
- Search across the app (Ctrl/Cmd+K).
- An account menu in the top right corner and a settings screen: light or dark look, push, data export, sign-out and guarded account deletion.
- Installable PWA. The service worker caches the app shell only; Supabase and location responses are never cached.

`docs/implementation-progress.md` says what is verified and what is not, and its top entry says what is on the cloud.

## Architecture

`src/app` puts the app together, `src/kernel` holds what every feature shares, and each feature is a folder in `src/modules` with domain, application, infrastructure and presentation layers. A feature joins the app through one line in `src/app/modules.ts`.

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

See:
- `docs/architecture.md`
- `docs/module-guide.md` (how to add a module)
- `docs/implementation-progress.md` (what is implemented, with evidence and open checks)
- `docs/master-plan.md` (the plan: architecture, UX, features, phases)
- `docs/feature-plan-2.md` (the second plan, built on 2026-10-09: landing page, chat, photos on Mode, map look, .ics import, shared expense books)
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

To stop local containers: `npx supabase@2.119.0 stop`. For cloud testing instead, apply every migration in `supabase/migrations/` in order and configure the cloud URL/publishable key; the app expects all of them. Migrations 0013–0029 have **not been applied to cloud**; `docs/implementation-progress.md` lists which features show errors until they are. Do not run `supabase db reset --linked` on the cloud project.

## Validate

Node 22.12 or newer is required (`.nvmrc`); Vite 8 and Vitest 4 do not start on Node 18.

```bash
npm run typecheck
npm test                  # the map styles against the color tokens, unit tests, the architecture rules, the calendar-feed handler
npm run test:db           # every migration + pgTAP files on an embedded Postgres, no Docker
npm run build
npm run test:e2e          # isolated mocked-browser UI tests; needs Playwright Chromium
npm run test:e2e:preview  # same suite against the production build
```

For a **fictional two-person map demo** in development, open `/demo/location` (An and Bình, public-place markers). It requires no Auth/GPS and never writes to Supabase; it does not verify real user privacy. The production build omits this route unless `VITE_ENABLE_DEMO=true` is deliberately set at build time. See `docs/implementation-progress.md` for the separate disposable **real-Auth two-browser-context** local test and its strict local-only safety guard.

The same SQL tests run on a real local Supabase Postgres, without Docker access for the test run itself:

```bash
npx supabase@2.119.0 migration up --local   # brings the local database up to the newest migration
npm run test:db:local                       # pgTAP files in transactions that roll back; localhost only
```

Push can be checked on one machine too, with real pushes and without a phone. It needs the local stack, Deno 2 and a way out to the internet; `docs/deployment.md`, "Checking push without a phone", says what it covers:

```bash
DENO=/path/to/deno npm run test:push:local
```

Do not run database tests against production. GitHub Actions now has a separate DB job; the new job has not yet been verified on CI. Earlier commits passed the typecheck, unit tests and build workflow on Node 24.

## Production

The production app is served at `https://9try.gnouht.space/` through Cloudflare Workers static assets; Supabase provides the backend. See [`docs/deployment.md`](docs/deployment.md) for the current release and steps for a future deploy.

Do **not** modify the existing `mcp.gnouht.space` DNS record, tunnel route or Cloudflare Access policy.

A fresh production setup needs:
- Supabase project URL + publishable key,
- applying migrations,
- deploying the Edge Functions (`process-reminders`, `delete-account`, `calendar-feed`),
- the sign-in email template with the 6-digit code,
- cron authorization for reminder processing,
- VAPID keys for Web Push,
- Cloudflare project/custom-domain binding for `9try.gnouht.space`.

The app does not expose service-role or VAPID private keys to browser code.

## Map style

The two map styles in `public/map` are made by `scripts/build-map-style.mjs` from OpenFreeMap's Positron style (`scripts/map/positron.json`), a fork of [openmaptiles/positron-gl-style](https://github.com/openmaptiles/positron-gl-style), with its colors changed. Copyright (c) 2024, MapTiler.com & OpenMapTiles contributors; Copyright (c) 2015, CartoDB Inc. Its code is under the BSD 3-Clause License and its design under CC-BY 4.0, derived from CartoDB Basemaps by Stamen and Paul Norman for CartoDB Inc., CC-BY 3.0. The map shows the credits of OpenFreeMap, OpenMapTiles and OpenStreetMap in its corner.
