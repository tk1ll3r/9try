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
2. The database must have every migration in `supabase/migrations/`. The cloud project is at 0012; chat, friend links, the live map, the timetable, pins and habit undo need 0013–0029. Apply them with `npx supabase@2.119.0 login` and `npx supabase@2.119.0 db push` after reading the note on 0015 below.
3. Sign-in by code inside an installed app needs the email template of section 1.

Checked before the first deploy: the production build passes the 32 browser tests in preview mode, contains no server secret and no demo route, and `wrangler deploy --dry-run` accepts the configuration.

First deploy: 2026-10-08, from commit `ccfe3b8` on the local branch `refactor/foundation`, Cloudflare version `ca7d292b`. Checked on the live site: status 200 with the security headers, deep links answered with the app, hashed assets cached as immutable, the sign-in screen renders, the service worker activates and the shell then opens offline. Not checked: an actual sign-in (it sends an email), and anything behind sign-in.

Known on the live site:

- Since 2026-10-08 the database has all 29 migrations and the site is the version of commit `1a78cbb`; the owner ran `db push` and `npm run deploy`.
- No Edge Function is deployed. Until they are: deleting an account fails, reminders never fire, and a calendar feed address answers "not found". `npx supabase@2.119.0 functions deploy calendar-feed delete-account --use-api` covers the first and the last; `process-reminders` also needs `CRON_SECRET` and a scheduler (section 3).
- Cloudflare adds its Web Analytics script (`static.cloudflareinsights.com`) to the pages. It is a zone setting, not part of the app; turn it off in the Cloudflare dashboard under Web Analytics if it is not wanted.
- A request for a file that does not exist under `/assets/` is answered with the app's HTML and status 200, as every unknown path is.
- Push notifications are off: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` is empty.

## Sign-in email (SMTP)

`gnouht.space` receives mail through Cloudflare Email Routing (its MX records point to `route*.mx.cloudflare.net`). That service forwards mail; it has no SMTP for sending. Supabase's built-in mailer is for testing only and allows a few messages an hour. Sign-in emails need a sending service that is allowed to send as `@gnouht.space`. Two fit:

| | Resend | Cloudflare Email Service |
|---|---|---|
| Cost | Free plan: 3,000 emails a month, 100 a day | Needs the Workers Paid plan; 3,000 a month included, then $0.35 per 1,000. In beta |
| SMTP host and port | `smtp.resend.com`, 465 | `smtp.mx.cloudflare.net`, 465 (implicit TLS) |
| Username | `resend` | `api_token` |
| Password | a Resend API key | a Cloudflare API token with "Email Sending: Edit" |
| DNS | Resend lists the records (DKIM, SPF and MX on a `send` subdomain); it can add them to Cloudflare for you | Added when the domain is onboarded for Email Sending |

Steps, the same for both:

1. In the sending service, add the domain `gnouht.space` and wait until it shows as verified. The records for sending live next to the Email Routing records; receiving keeps working. Do not change the records of `mcp.gnouht.space`.
2. Supabase dashboard → Authentication → Emails → SMTP Settings: turn on custom SMTP and enter the host, port, username and password above. Sender email `no-reply@gnouht.space`, sender name `Gnouht Together`. The password is a secret: type it into the dashboard, never into a file of this repository. Resend can also fill these fields itself through its Supabase integration.
3. Authentication → Emails → Templates, for both "Magic Link" and "Confirm signup": subject `Mã đăng nhập Gnouht Together`, body from `supabase/templates/magic_link.html`. The code in that template is what lets an installed app sign in. The button links to the app itself (`<redirect address>?token_hash=…`), not to `supabase.co`, so the mail's links match the sender's domain; the app exchanges the token in `src/kernel/auth.tsx`. Deploy the app before pasting the template, and keep Site URL = `https://9try.gnouht.space` with `https://9try.gnouht.space/**` in Redirect URLs.
4. Authentication → Rate Limits: raise "emails per hour" from the default to what a class needs, for example 100.
5. Add a DMARC record so mailboxes trust the domain: TXT `_dmarc.gnouht.space` = `v=DMARC1; p=none; rua=mailto:<an address you read>`.
6. Sign in once from `https://9try.gnouht.space` with an address outside your own accounts, and check that the mail arrives, is not in Spam, shows the 6-digit code, and that the link returns to `9try.gnouht.space`.

The sections below are the full checklist for a production launch.

## 1. Supabase project

Create the production Supabase project in the preferred region.

Apply all SQL migrations in `supabase/migrations/` **in filename order**.

Configure Auth:
- Site URL: `https://gnouht.space`
- Development redirect(s): only the local origins actually used.
- Email template "Magic Link": include the 6-digit code `{{ .Token }}` next to the link, as in `supabase/templates/magic_link.html`. An installed app on iOS cannot finish sign-in from the link alone.

Realtime: the app listens on private channels named `user:<id>`. Migration 0017 adds the policy on `realtime.messages`; check in the project's Realtime settings that private channels are allowed.

The cloud project is at migration 0012. Migrations 0013–0029 are tested on an embedded Postgres only. Run `npx supabase test db supabase/tests/database` on a real local or staging stack before applying them. 0015 deletes availability shares between people who are no longer friends.

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
