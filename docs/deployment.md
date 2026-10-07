# Deploy Gnouht Together

## Quick path: the web app at 9try.gnouht.space

The web app is static files on Cloudflare (`wrangler.jsonc`, Workers static assets). The backend stays the Supabase project named in `.env.local`.

```bash
npx wrangler@4 login      # once, opens the browser
npm run deploy            # typecheck, build with .env.local, upload, bind 9try.gnouht.space
```

`wrangler deploy` creates the DNS record and certificate for `9try.gnouht.space` only. It does not touch `mcp.gnouht.space`, its tunnel or its Access policy.

Three things outside the upload decide whether the deployed app works:

1. Supabase dashboard, Authentication → URL Configuration: add `https://9try.gnouht.space/**` to the redirect URLs (and make it the Site URL if this is the main address). Without it the sign-in link sends people to the old Site URL.
2. The database must have every migration in `supabase/migrations/`. The cloud project is at 0012; chat, friend links, the live map, the timetable, pins and habit undo need 0013–0028. Apply them with `npx supabase@2.119.0 login` and `npx supabase@2.119.0 db push` after reading the note on 0015 below.
3. Sign-in by code inside an installed app needs the email template of section 1.

Checked before the first deploy: the production build passes the 32 browser tests in preview mode, contains no server secret and no demo route, and `wrangler deploy --dry-run` accepts the configuration.

First deploy: 2026-10-08, from commit `ccfe3b8` on the local branch `refactor/foundation`, Cloudflare version `ca7d292b`. Checked on the live site: status 200 with the security headers, deep links answered with the app, hashed assets cached as immutable, the sign-in screen renders, the service worker activates and the shell then opens offline. Not checked: an actual sign-in (it sends an email), and anything behind sign-in.

Known on the live site:

- The database is still at migration 0012, so the features listed in point 2 show "máy chủ chưa được cập nhật".
- Cloudflare adds its Web Analytics script (`static.cloudflareinsights.com`) to the pages. It is a zone setting, not part of the app; turn it off in the Cloudflare dashboard under Web Analytics if it is not wanted.
- A request for a file that does not exist under `/assets/` is answered with the app's HTML and status 200, as every unknown path is.
- Push notifications are off: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` is empty.

The sections below are the full checklist for a production launch.

## 1. Supabase project

Create the production Supabase project in the preferred region.

Apply all SQL migrations in `supabase/migrations/` **in filename order**.

Configure Auth:
- Site URL: `https://gnouht.space`
- Development redirect(s): only the local origins actually used.
- Email template "Magic Link": include the 6-digit code `{{ .Token }}` next to the link, as in `supabase/templates/magic_link.html`. An installed app on iOS cannot finish sign-in from the link alone.

Realtime: the app listens on private channels named `user:<id>`. Migration 0017 adds the policy on `realtime.messages`; check in the project's Realtime settings that private channels are allowed.

The cloud project is at migration 0012. Migrations 0013–0028 are tested on an embedded Postgres only. Run `npx supabase test db supabase/tests/database` on a real local or staging stack before applying them. 0015 deletes availability shares between people who are no longer friends.

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
- `calendar-feed`

`supabase/config.toml` turns the platform's JWT check off for `process-reminders` and `calendar-feed`. Neither is called with a user's token: the first compares `CRON_SECRET`, the second looks up the token in the address. `calendar-feed` has not been deployed or run on Deno yet; fetch a feed address with `curl` and subscribe to it from a calendar app before telling anyone about it.

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
12. Verify sign-in with the emailed code inside an installed app on iOS and Android.
13. Verify with two signed-in browsers that a chat message, a friend request and a location update arrive without reloading.
14. Verify that a revoked calendar feed address answers "not found".
15. Run the GitHub Actions CI workflow successfully.

## 9. Backups and monitoring

Enable backup/PITR appropriate to the Supabase plan and rehearse restore using `docs/backup-restore.md`.

Monitor:
- database/storage growth,
- Edge Function errors,
- reminder retry/failure counts,
- push subscription churn,
- abnormal location write volume.
