# Deploy Gnouht Together

## Current status (checked 2026-10-12 10:44 UTC)

- The latest frontend build deployed successfully to `https://9try.gnouht.space/`. Cloudflare Worker version `0f6a110b-97eb-4ef8-8301-89fe3461d8bc` serves the static app and binds the request-count Durable Object. The build ran TypeScript and Vite; it reports the `MapCanvas` chunk at 1.05 MB. Production page and location assets returned HTTP 200. The 9 map Playwright checks and the location-sharing-across-screens check passed in Chromium with mocked GPS/backend data.
- Supabase migrations 0001–0055 are applied. Migration 0054 fixes the state-table alias in 0053 that caused location sharing to fail during trigger updates. Migration 0055 makes nearby alerts automatic for reciprocal active shares, with optional per-user radius and repeat customizations. Migration 0049 records daily moment posts; migration 0051 initially set streak badges at four consecutive local posting days, and migration 0052 lowers the threshold to three. Production `get_public_site_metrics()` returned 28 registered users and 286 landing-page openings at 06:15 UTC.
- Nearby alerts are automatic; neither friend needs to enable an alert toggle. Defaults are 500 m and a 30-minute repeat interval. Both positions must have updated within 2 minutes and have GPS accuracy at or below 200 m; approximate positions can qualify, with both accuracy values added to the measured distance to reduce false alerts. Optional radius and repeat customizations remain in the map settings. The push worker is `process-reminders` v6; its VAPID pair, worker secret, and database vault entries were verified during this release.
- Deployed frontend assets are served from `https://9try.gnouht.space/`; Cloudflare Worker version `a40de03e-080c-4eaa-b507-3e5115a3fc34` is active. The home page and updated location page chunk returned HTTP 200. TypeScript/Vite build and all 31 database test files passed; the nearby alert test passed 10/10. A post-deploy live check created an unread nearby notification; its push reminder was marked delivered, and both registered device endpoints reported success without a failure.
- New location shares default to continuous until the user stops them. The GPS watcher stays with the signed-in session while navigating to other app screens, and the global banner can stop it. The browser may suspend GPS when its tab is hidden or the screen is locked; the web app cannot guarantee background updates on iOS or Android.
- `delete-account` v5, `calendar-feed` v3, `process-reminders` v6, and `send-test-push` v6 were active at the 06:22 UTC function check.
- `/api/public-request-count` returned 22,560 at 06:22 UTC. Its historical host-specific baseline is Cloudflare's sampled 22,521 requests through 05:22 UTC; the estimate's 95% confidence interval is 22,110–22,931. The count includes app-host assets and automated traffic. Cloudflare's 23,170 requests and 347 unique visitors are separate seven-day zone-wide metrics, so they do not match this first-deploy app-host counter or registered-user count.
- The landing-page opening baseline is a Cloudflare RUM estimate through 04:57 UTC. Openings between that snapshot and release are not included; the page records new openings after release and refreshes visible totals once a minute.
- The seven-day Cloudflare edge baseline is collected; the Supabase baseline and staging load run remain pending. See [`performance-plan.md`](performance-plan.md) before choosing a load target or changing capacity.

For a future release, with the Supabase CLI linked and Node 22 on the PATH, apply pending migrations before deploying the frontend. Deploy any changed Edge Functions, then run `npm run deploy` to fetch the linked project's publishable key in memory, build, and upload the app. `npm run deploy -- --dry-run` verifies the production build and Worker configuration without publishing. Confirm the migration list is current, inspect active function versions, and check the public page plus `/api/public-request-count`.

## Quick path: the web app at 9try.gnouht.space

The web app is static files on Cloudflare (`wrangler.jsonc`, Workers static assets). The backend stays the Supabase project named in `.env.local`.

```bash
npx wrangler@4 login      # once, opens the browser
npm run deploy            # typecheck, build for the linked Supabase project, upload, bind 9try.gnouht.space
```

`wrangler deploy` creates the DNS record and certificate for `9try.gnouht.space` only. It does not touch `mcp.gnouht.space`, its tunnel or its Access policy.

Historical setup checks from the first deployment (2026-10-08); recheck account settings before a future release:

1. Supabase dashboard, Authentication → URL Configuration: add `https://9try.gnouht.space/**` to the redirect URLs, and set the Site URL to `https://9try.gnouht.space` (no `/**`: the pattern belongs in the redirect list only). The 2026-10-08 check found the redirect entry and a Site URL ending in `/**`; verify the current value before testing sign-in.
2. The database must have every migration in `supabase/migrations/`. The 2026-10-12 release applied migrations through 0051; see the current status above for the last verification.
3. Sign-in by code inside an installed app needs the email template of section 1.

Checked before the first deploy: the production build passes the 32 browser tests in preview mode, contains no server secret and no demo route, and `wrangler deploy --dry-run` accepts the configuration.

First deploy: 2026-10-08, from commit `ccfe3b8` on the local branch `refactor/foundation`, Cloudflare version `ca7d292b`. Checked on the live site: status 200 with the security headers, deep links answered with the app, hashed assets cached as immutable, the sign-in screen renders, the service worker activates and the shell then opens offline. Not checked: an actual sign-in (it sends an email), and anything behind sign-in.

Earlier live-site checks (superseded by the status above):

- Since 2026-10-08 the database has all 29 migrations; the owner ran `db push` and `npm run deploy`. On the morning of 2026-10-08 the site was the version of commit `2873a45`: it exchanges the token of the sign-in email's button and has the Google button.
- No Edge Function is deployed. Until they are: deleting an account fails and a calendar feed address answers "not found". To a browser a missing function looks like a lost connection (its preflight request is answered 404, checked on the live project on 2026-10-08), so the app says it could not call the server and that the feature may not be turned on there. `npx supabase@2.119.0 functions deploy calendar-feed delete-account --use-api` covers both; they need no secret of their own. `process-reminders` is only needed for push, and also needs `CRON_SECRET`, the VAPID keys and a scheduler (section 3).
- Migration 0030 is applied (read with `migration list --linked` on 2026-10-08, 15:10). Before it was, "Nhắc việc" stores a reminder that never arrives. With it, the database puts a due reminder into the inbox every minute, without the worker. It relies on pg_cron, which migration 0015 tries to enable; if the push prints "pg_cron is unavailable", turn the extension on under Database → Extensions and run `select cron.schedule('deliver-due-reminders', '* * * * *', 'select private.deliver_due_reminders()');` in the SQL editor.
- On 2026-10-08, 15:10, the live site served a build with the language switch, so the calendar, the account menu, the settings screen, the statistics screen and English are deployed. The work of the app development plan (section below) is not.
- Cloudflare adds its Web Analytics script (`static.cloudflareinsights.com`) to the pages. It is a zone setting, not part of the app; turn it off in the Cloudflare dashboard under Web Analytics if it is not wanted.
- A request for a file that does not exist under `/assets/` is answered with the app's HTML and status 200, as every unknown path is.
- Push notifications are off: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` is empty.

## Putting the work of the app development plan on the cloud

Written on 2026-10-08 and brought up to date on 2026-10-09. The commands are for the owner to run, with Node 22 on the PATH. Each step works without the later ones.

On 2026-10-09 the owner ran steps 1 and 3: read at 09:07 that day, the cloud database was at migration 0037 and the four functions were active. Step 2 had not reached the site by 09:10 (its newest deployment was still the one of 2026-10-08), and step 4 had not been run: the project had no push key and the vault no entry for the worker. Migration 0038 was written after that and waits for another `db push`.

### 1. The database

```bash
npx supabase@2.119.0 db push --linked     # applies what is not there yet; on 2026-10-09 that is 0038
```

After the push, read-only: `npx supabase@2.119.0 migration list --linked` shows no pending migration. If the push printed "pg_net is unavailable", turn the extension on under Database → Extensions; push then still needs step 4.

### 2. The web app

```bash
npm run deploy
```

The app works on a database without the new migrations (it says a feature is not there yet), so the order of steps 1 and 2 does not matter. Step 4 ends with this same command, so whoever runs step 4 can skip this one.

### 3. The functions

```bash
npx supabase@2.119.0 functions deploy delete-account calendar-feed process-reminders send-test-push --use-api
```

`delete-account` and `calendar-feed` need no secret of their own. `delete-account` now answers a browser's preflight request; before, a deployed copy would still have failed from the web app.

### 4. Push notifications

Push needs a key pair that browsers and the server share (VAPID), a secret between the database and the worker, and the worker's address where the database can read it. One command makes and places all of them, deploys the two functions that send pushes, checks that everything agrees, and deploys the web app, which has the public key built in:

```bash
npm run push:setup
```

It needs step 1 done, the Supabase CLI linked to the project, and `.env.local` with the app's settings. It deploys `process-reminders` and `send-test-push` itself, from this folder, so these two are the current version and start with the new secrets. It prints each thing it does and no secret: the private key and the worker's secret go from the command to Supabase and are kept nowhere else, not in a file of this repository and not in the terminal's history. Only the public key is written down, as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` in `.env.local`.

Running it again is safe. It keeps the key pair, replaces the worker's secret on both sides, checks and deploys again. When something does not answer it stops and says why:

| It says | What to do |
|---|---|
| "supabase … failed", with what the CLI printed | Usually the CLI's sign-in or the link to the project: `npx supabase@2.119.0 login`, `npx supabase@2.119.0 link` |
| The worker answered 401, 503 or 404, after a minute of asking | Run it again. If it stays: the function's logs in the Supabase dashboard |
| The database's own call to the worker failed or left no trace | Turn `pg_net` on under Database → Extensions, then run it again |
| The web app was not deployed | Fix what the deploy printed (for a sign-in problem: `npx wrangler@4 login`), then `npm run deploy` |
| The project already has a push key pair, but `.env.local` does not hold its public half | Put the public key back into `.env.local`. If it is lost: `npm run push:setup -- --new-keys` |

`--new-keys` replaces the key pair. A device that was signed up under the old pair signs itself up again the next time its app is opened with the new build; until then it gets no push.

Then, in the app, on each device: Cài đặt → Thông báo đẩy → "Bật thông báo đẩy", and "Gửi thông báo thử". The list of devices shows what each device's push service answered.

On iPhone and iPad a web app gets push only after it was added to the Home Screen, and only asks for permission in direct answer to a tap. The settings screen says so on such a device.

What the command does, for doing it by hand or for looking at one part:

```bash
npx web-push generate-vapid-keys          # a public and a private key; keep the private one out of every file of this repository
openssl rand -hex 32                      # the worker's secret
npx supabase@2.119.0 secrets set CRON_SECRET=<secret> WEB_PUSH_VAPID_PUBLIC_KEY=<public key> WEB_PUSH_VAPID_PRIVATE_KEY=<private key> WEB_PUSH_CONTACT=mailto:admin@gnouht.space
```

Then the two functions are deployed again (step 3), the public key goes into `.env.local` as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<public key>`, and `npm run deploy` follows. The database learns where the worker is in the Supabase dashboard's SQL editor; the values are stored encrypted:

```sql
select vault.create_secret('https://<project ref>.supabase.co/functions/v1/process-reminders', 'push_worker_url');
select vault.create_secret('<the same secret>', 'push_worker_secret');

select private.kick_push_worker();
select status_code, content from net._http_response order by created desc limit 1;   -- a few seconds later: 200 and {"ok":true,…}
```

A 401 means the two secrets differ. A 503 with "push not configured" means the function does not have the three `WEB_PUSH_*` secrets.

#### Checking push without a phone

```bash
DENO=/path/to/deno npm run test:push:local
```

This sends real pushes on one machine and never reaches the cloud project. It builds the app for the local Supabase stack, runs the two functions on Deno, signs a browser up with a real push service, and follows a friend request and chat messages from the database through the worker to a notification the service worker shows. It also checks the language of a push, the private preview, quiet hours, a kind that is turned off, an address the browser gave up, a replaced key pair, and a tap on a notification. The push service of the test browser is not always reliable: when it does not deliver the first push at all, the command says "NOT CHECKED" and ends with code 2, which says nothing about the app; a line that starts with "skip" is a step that depended on that service's own timing. It needs the local stack with every migration applied, Deno 2, and a way out to the internet. It says nothing about a phone: an installed iPhone app and Android have their own push services and their own rules.

### 5. The expense ledger

Migration 0036 gives the capability `couple_expenses` to the account whose username is `tk1ll3r` when it runs, and prints one of two notices during `db push`:

- `couple_expenses was granted to user <id> (username tk1ll3r, signs in as <address>).` Check that the address is yours. If it is not, take the grant back with the statement below.
- `No account has the username tk1ll3r…` Nothing was granted. Set the username in the app's profile first, or grant by id.

In the Supabase dashboard's SQL editor:

```sql
select id, username from public.profiles where lower(username) = 'tk1ll3r';       -- the account's id
select private.grant_feature('<user id>', 'couple_expenses');                     -- give
select private.revoke_feature('<user id>', 'couple_expenses');                    -- take back; the entries stay
select user_id, feature, granted_at, revoked_at from public.feature_grants;        -- who has what
```

The grant belongs to the user id. Renaming the account does not lose it, and someone who takes the name `tk1ll3r` later does not get it. An account that has the app open sees "Chi tiêu" in the Menu a few minutes after a grant, or at once after a reload.

## Putting the work of feature plan 2 on the cloud

Written on 2026-10-09. The plan is [feature-plan-2.md](feature-plan-2.md); it adds migrations 0039 to 0044, two Storage buckets, a second job in the push worker and two map styles. The commands are for the owner to run, with Node 22 on the PATH, in this order. Read at 22:33 that day with `db push --linked --dry-run`: the cloud database was at 0038, and 0039 to 0044 were the ones a push would apply. The owner ran the three commands in the night of 2026-10-10; read at 02:40, the database was up to date and the site was the new build. From then on a correction to 0039 to 0044 is a new migration.

The order matters. The new build sends messages through `post_message` and opens the ledger through `list_expense_books`, which exist from 0041 and 0043: a site deployed before the database push cannot send a chat message or open the ledger.

```bash
npx supabase@2.119.0 db push --linked          # 0038 if it is still waiting, then 0039 to 0044
npm run push:setup                             # push keys and secrets, the worker's address, process-reminders and send-test-push, then the web app
npx supabase@2.119.0 functions deploy delete-account --use-api
```

Where push is already set up, `npm run push:setup` can be run again (it keeps the key pair), or replaced by `npx supabase@2.119.0 functions deploy process-reminders delete-account --use-api` and `npm run deploy`.

What each part needs:

| Part | Needs |
|---|---|
| The .ics import, the landing page, the map's look | `npm run deploy` only. The import falls back to nothing: on a database without 0039 it says the feature is not there yet |
| Photos on Mode | 0040, which makes the bucket `moments` and the job `moments-expire`. Without the worker deployed and called by the database (`npm run push:setup`), expired photos stop being readable all the same, and their files stay in the bucket until the worker runs |
| Chat: replies, reactions, edits, unsend, seen, typing, mute, search | 0041 |
| Chat: photos and cards | 0042, which makes the bucket `chat` |
| Shared expense books | 0043 and 0044. Books that exist get their owner as their first member |
| Deleting an account that has photos | `delete-account` deployed again |

After the push, read-only: `npx supabase@2.119.0 migration list --linked` shows no pending migration, and the dashboard lists the buckets `moments` and `chat` under Storage, both private.

`.env.local` must not set `VITE_MAP_STYLE_URL`, or the build draws the map with that one style in both looks. The line was taken out of this machine's `.env.local` on 2026-10-09.

What only a phone can show, and was not checked: the camera opening from "Đăng ảnh" inside the installed app on an iPhone and on Android, a push for a new photo, dragging the sheet on the map with a finger, and the card a chat app draws for the site's address.

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

## Sign-in with Google

The sign-in screen shows "Tiếp tục với Google" only while the Supabase project has the Google provider turned on. It reads the project's public settings (`/auth/v1/settings`) each time the screen opens, so the button appears by itself once the steps below are done, with no new build, and goes away if the provider is turned off. With the provider off, the server answers a request for Google with a bare JSON error ("provider is not enabled"); that is why the button is not shown then.

Supabase links sign-ins that share a verified email address to one account, so someone who signed in by email before and now uses Google with the same address should get the same account (documented behaviour, not tested on this project). Google gives the name, the email address and the picture address. The name is offered in the profile form and saved only when the form is.

Steps, all in dashboards:

1. Supabase dashboard → Authentication → Sign In / Providers → Google: copy the "Callback URL (for OAuth)". It ends in `/auth/v1/callback`.
2. Google Cloud console → new project → Google Auth Platform (the OAuth consent screen): app name `Gnouht Together`, audience "External". Under Branding → Authorized domains add `gnouht.space` and the host of the callback URL (`<project ref>.supabase.co`). Leave the logo empty: a logo starts Google's brand review.
3. Audience → "Publish app". While the app is in "Testing", only the listed test users can sign in. The scopes in use (`openid`, `email`, `profile`) need no review.
4. Clients → Create client → "Web application". Authorized JavaScript origins: `https://9try.gnouht.space`. Authorized redirect URIs: the callback URL from step 1. Keep the client ID and the client secret.
5. Back in Supabase, on the Google provider: turn it on, paste the client ID and the client secret, save. The secret goes into the dashboard only, never into a file of this repository.
6. Open `https://9try.gnouht.space` signed out: the Google button is there. Sign in with it and check that the app opens on the page that was asked for.

### Which domain Google's screen names

Google's screen says "continue to" followed by the domain it will return to. Through Supabase that is the project's address, `<project ref>.supabase.co`. Three ways change it:

| Way | Cost | What Google shows |
|---|---|---|
| Google returns straight to the app (`VITE_GOOGLE_CLIENT_ID`) | Free, built in | The app's own domain |
| Supabase custom domain, for example `auth.gnouht.space` | A paid Supabase plan plus the add-on, about $35 a month for one project | That subdomain |
| Google brand verification | Free, takes days | The app's name and logo. People report that Google refused it, or that the Supabase address stayed after approval, so do not count on it |

The first way is what the app does when the build knows the client ID (`src/kernel/google.ts`):

1. The app sends the browser to Google with `response_type=id_token`, the app's own origin as `redirect_uri`, and the SHA-256 hash of a random nonce. The nonce itself stays in this browser's storage.
2. Google returns to the app with an ID token in the address fragment. The app takes it out of the address and hands it to Supabase with the nonce (`signInWithIdToken`).
3. Supabase checks Google's signature, that the token was made for the project's client ID, and that the nonce matches the hash inside the token. A token that this browser did not ask for has no nonce here and is not sent on.

To turn it on:

1. Google Cloud console → Clients → the web client → Authorized redirect URIs: add `https://9try.gnouht.space`, exactly, with no slash at the end. For local work add `http://127.0.0.1:5173` too. Google can take some minutes to apply it.
2. `.env.local`: `VITE_GOOGLE_CLIENT_ID=<the client ID>`. It is public, and it must be the client ID entered on Supabase's Google provider. The line is there since 2026-10-08, read from the address the project itself sends people to.
3. `npm run deploy`.

Deploying before step 1 breaks the Google button: Google answers `redirect_uri_mismatch` on its own page. Without the line in `.env.local`, or in a browser that cannot keep the nonce, the button goes through Supabase's address as before. After sign-in the app opens the page that was asked for from the tab's own memory, because the address Google returns to is fixed.

Not verified: a real round trip through Google the direct way, the text Google shows for it, and sign-in from an installed app on iOS and Android. The way through Supabase's address reached Google's account chooser for the owner on 2026-10-08. The browser tests cover both ways against stand-ins for Google and for Supabase.

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
VITE_WEB_PUSH_VAPID_PUBLIC_KEY=<public VAPID key>
```

`VITE_MAP_STYLE_URL` is optional. Left out, the map uses the app's own two styles, one for each look. Set, that one style is used for both.

Never put the Supabase service-role key or VAPID private key in a `VITE_*` variable.

## 2. Edge Functions

Deploy:
- `process-reminders`
- `delete-account`
- `calendar-feed`

`supabase/config.toml` turns the platform's JWT check off for `process-reminders` and `calendar-feed`. Neither is called with a user's token: the first compares `CRON_SECRET`, the second looks up the token in the address. `calendar-feed` is active in production; fetch a feed address with `curl` and subscribe to it from a calendar app when checking calendar-feed behavior.

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

Since migration 0030 a personal reminder reaches the inbox without this worker: the database delivers it through pg_cron. The worker is what sends Web Push, for reminders and for every other notification.

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

MapLibre is the renderer. The two styles are files of the app, `public/map/light.json` and `public/map/dark.json`, built by `npm run build:map` from OpenFreeMap's Positron style and the app's color tokens. The tiles, fonts and sprites they name are OpenFreeMap's public ones.

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
