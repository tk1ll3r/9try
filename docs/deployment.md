# Deploy Gnouht Together to gnouht.space

## 1. Supabase project

Create the production Supabase project in the preferred region.

Apply all SQL migrations in `supabase/migrations/` **in filename order**.

Configure Auth:
- Site URL: `https://gnouht.space`
- Development redirect(s): only the local origins actually used.

Frontend-safe environment values:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>
VITE_APP_ORIGIN=https://gnouht.space
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<public VAPID key>
```

Never put the Supabase service-role key or VAPID private key in a `VITE_*` variable.

## 2. Edge Functions

Deploy:
- `process-reminders`
- `delete-account`

Set server-only secrets:

```
SUPABASE_SERVICE_ROLE_KEY=<service-role key>
CRON_SECRET=<strong random value>
WEB_PUSH_VAPID_PUBLIC_KEY=<public VAPID key>
WEB_PUSH_VAPID_PRIVATE_KEY=<private VAPID key>
WEB_PUSH_CONTACT=mailto:<valid operational contact>
```

Use the Supabase-provided URL/anon configuration expected by Edge Functions for authenticated user calls.

## 3. Reminder scheduler

Invoke `process-reminders` from a server-side scheduler such as Supabase cron/pg_cron or an authenticated Cloudflare Cron trigger.

Send:

```
Authorization: Bearer <CRON_SECRET>
```

The worker:
- recovers abandoned jobs,
- limits retry attempts,
- uses a dedupe key for in-app notifications,
- creates the in-app notification first,
- treats Web Push as best-effort,
- removes expired push subscriptions.

No open browser tab is required.

## 4. Frontend deployment

Build:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Publish `dist/` to Cloudflare Pages or Cloudflare Workers static assets.

The PWA caches static shell assets only. Do not add blanket runtime caching for Supabase API responses or live-location data.

## 5. Cloudflare DNS and custom domain

Bind the frontend to:

```
gnouht.space
```

Optional:

```
www.gnouht.space
```

Do **not** alter:
- `mcp.gnouht.space` DNS,
- its tunnel route,
- its Cloudflare Access policy,
- any credentials used by that service.

The hosted frontend + Supabase backend remain online while a personal development computer is powered off.

## 6. Web Push verification

Test on real devices before production launch.

Important:
- permission must be initiated by a user action,
- push is not guaranteed or instantaneous,
- some platforms require the PWA to be installed before Web Push works,
- quiet hours and per-category preferences are enforced server-side.

Always rely on the in-app notification center as the durable source of truth.

## 7. Map provider

MapLibre is the renderer. The default style URL is configurable.

Keep attribution visible and review the selected map provider's current terms, quota and SLA before launch. If production requires a guaranteed SLA, replace the style/tile endpoint or self-host without changing location-domain rules.

## 8. Production acceptance checks

Before DNS cutover:

1. Apply migrations to a clean staging project.
2. Create at least two test users.
3. Verify friendship/blocking and profile privacy.
4. Verify group ownership transfer and invitation expiry.
5. Verify concurrent meetup RSVP cannot exceed capacity.
6. Verify free/busy does not expose title/description/location.
7. Verify recurring event behavior around timezone/DST boundaries.
8. Verify location stop removes the latest stored coordinate.
9. Verify reminder worker creates one in-app record on retry.
10. Verify account deletion requires group ownership transfer when necessary.
11. Verify PWA installation and offline shell behavior.
12. Run the GitHub Actions CI workflow successfully.

## 9. Backups and monitoring

Enable backup/PITR appropriate to the Supabase plan and rehearse restore using `docs/backup-restore.md`.

Monitor:
- database/storage growth,
- Edge Function errors,
- reminder retry/failure counts,
- push subscription churn,
- abnormal location write volume.
