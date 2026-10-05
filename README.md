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

Presentation -> application/domain rules -> infrastructure adapters -> Supabase.

Security-sensitive invariants are enforced twice where appropriate:
- domain classes for deterministic business behavior,
- Postgres constraints/RLS/RPC transactions for untrusted clients and concurrency.

See:
- `docs/architecture.md`
- `docs/permission-matrix.md`
- `docs/deployment.md`
- `docs/backup-restore.md`
- `docs/cost-and-limits.md`

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Apply every migration in `supabase/migrations/` in order before running against a new Supabase project.

## Validate

```bash
npm run typecheck
npm test
npm run build
```

The repository has also been validated on GitHub Actions with Node 24: typecheck, unit tests and production build all passed.

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
