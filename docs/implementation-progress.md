# Development-plan implementation status

Newest first. The times of day in the titles of 2026-10-08 follow the commit times (`git log --date=iso`), +07.

## 2026-10-12 10:39 UTC: automatic nearby alerts deployed

- Nearby alerts now send automatically when two friends share locations with each other and both positions are recent. No alert opt-in is required. New users get a 500 m radius and 30-minute repeat interval; the radius and interval remain optional customizations. Approximate positions can qualify when GPS accuracy is at most 200 m and the measured distance plus both accuracy values fits within the recipient's radius.
- Applied Supabase migration 0055 and deployed Cloudflare Worker version `a40de03e-080c-4eaa-b507-3e5115a3fc34`. The production home page and updated location chunk returned HTTP 200. TypeScript/Vite build passed, all 31 database test files passed, and `location_nearby.test.sql` passed 10/10. A live post-deploy check created an unread nearby notification; the push reminder was marked delivered, with success reported by both registered device endpoints and no failures.

## 2026-10-12 07:38 UTC: nearby alerts recheck and repeat interval

- Nearby alerts now re-evaluate when either side saves alert settings or changes a mutual location share, so already-near friends can be notified as soon as both opt in and have fresh precise positions. Alerts repeat while both positions stay fresh and close, subject to each recipient's chosen 5, 10, 15, 30 or 60 minute interval.
- Applied migration 0053 and deployed Cloudflare Worker version `b187af88-2405-4e73-96e7-e333b18a7e49`. TypeScript and Vite build passed; automated tests were not run as requested. The existing `MapCanvas` chunk warning remains at 1.05 MB raw (285 kB gzip).

## 2026-10-12 07:23 UTC: three-day posting streak badges deployed

- Lowered the flame badge threshold from four consecutive local posting days to three across the story frame, story viewer, personal profile, and friend profile card. Applied migration 0052 to production and deployed Cloudflare Worker version `5bd17ab8-f598-4c5f-8530-6a37486cb77d`.
- The deployment build passed TypeScript and Vite. Automated tests were not run as requested. Vite reported the existing `MapCanvas` chunk at 1.05 MB raw (285 kB gzip).

## 2026-10-12 07:10 UTC: navigation trim, posting streak badges, and nearby-alert status

- Hid `Today`, `Tasks`, `Statistics`, `Meetups` and `Expenses` from navigation and global search. Their routes and stored data remain available for old links and notifications. Habits and Notes are now standalone navigation items.
- Moment streaks count one post per local calendar day. Migration 0051 initially changed the badge RPC threshold to four consecutive days; migration 0052 lowers it to three. The flame badge appears on the Mode story frame, story viewer and personal profile, including a friend's profile card. The post mutation refreshes the streak query.
- Checked the production migration list: migrations 0048, 0049 and 0050 were already applied. Applied 0051 with `db push --linked`.
- Nearby alerts are deployed: migration 0048 is active, the map settings are in the current frontend, and `process-reminders` v6 was active in the 06:22 UTC function check. Alerts are off by default and require both friends to opt in and mutually share recent exact locations.
- Deployed Cloudflare Worker version `9d69a95e-8346-4886-96eb-95c5af44d5a0` at `9try.gnouht.space`.

Validation: the deployment build passed TypeScript and Vite. Automated tests were not run. Vite reports the existing `MapCanvas` chunk at 1.05 MB raw (285 kB gzip).

## 2026-10-12 06:22 UTC: public metrics, compact Mode discussions, navigation fix, and release

- Deployed the anonymous-safe Supabase metrics API. A profile trigger keeps the registered-member count current; each public landing-page opening increments one atomic counter. The landing page refreshes the totals once a minute while visible and when the tab returns. Production read-only verification returned 28 registered users and 286 landing-page openings. The visit seed is Cloudflare's sampled estimate through 2026-10-12 04:57:40 UTC (summed per-day 95% confidence bounds 253–319); new openings are recorded after release.
- Deployed the cumulative app-host request counter in Cloudflare Durable Objects. Its sampled historical baseline is 22,521 requests through 2026-10-12 05:22 UTC (95% confidence interval 22,110–22,931); the public endpoint returned 22,560 at 06:22 UTC. It includes static assets and bot traffic. The baseline is host-specific, unlike Cloudflare's 23,170 seven-day zone-wide requests; there is a gap between the sampled baseline and Worker release, so the number is an estimate near release.
- Updated the Menu to list every screen the signed-in account can access, including child tabs, which also remain on their parent screens. This fixes the earlier layout that hid child screens from the Menu. Notifications and account/privacy/settings remain in their fixed top-bar controls; expenses remain capability-gated by the server.
- Shortened Mode discussion titles to the Mode label and placed the owner's name on a secondary line in the room list and header. Kept the existing Mode action that opens or joins its discussion.
- Set the phone viewport to a fixed initial scale with pinch zoom disabled, as requested.
- Production release at that time: database migrations 0001–0050 were applied; `delete-account` v5, `process-reminders` v6, and `send-test-push` v6 were active; Cloudflare Worker version `8804bf69-9bd6-4acf-a58c-35ddd90fdc8b` served `9try.gnouht.space`. The first upload used the local Supabase URL; it was rebuilt with the linked production URL and publishable key and redeployed. The served Supabase and Menu chunks returned HTTP 200, the production project host was embedded, the local host was absent, and the anonymous metrics RPC returned HTTP 200 with 28 users and 286 visits.
- Updated `npm run deploy` to retrieve the linked project's publishable key in memory before building, so a local `.env.local` cannot point a production deploy at localhost. `npm run deploy -- --dry-run` passes without publishing.
- Replaced the speculative 100-session first benchmark with a seven-day Cloudflare edge baseline followed by a staging workload sized from observed traffic. The Supabase baseline and staging workload remain pending; no service plan or capacity was changed.

Validation: production build passes on Node 22.12.0; all 30 SQL test files pass, including the public metrics migration; 241 unit tests pass; the full browser suite passed 102/102 before the final Menu follow-up, and the updated Menu/navigation browser test passed. `git diff --check` passes. The build reports the lazy MapCanvas chunk at 1.05 MB raw (285 kB gzip), documented for baseline measurement.

## 2026-10-11: the Mode, photo archive, Notes, map, and chat refresh

The owner asked for a youthful pink-gradient identity, a larger Mode/photo focus, stories that last 24 hours with unlimited posting and a separate attributed archive, simpler navigation with shareable Notes, more direct map interactions, Messenger-like chat, an unmirrored front-camera capture, and smoother capture/realtime behavior.

Implemented in the working tree:

- Changed the light/dark palette, brand mark, app icons, social card, browser colors, and generated map styles to pink and rose.
- Removed Tasks, Habits, Today, Meetups, Expenses, and Statistics from navigation and search entry points, while retaining their routes and data.
- Added a larger photo frame on Mode, in-app capture with mirrored front preview and unmirrored saved output, worker-based image compression, and a paginated archive that retains the original audience and photographer attribution.
- Added note shares to selected friends and groups, with view/edit grants and database-enforced revocation when access changes.
- Added Chat and Suggest a meetup actions to friend map cards and refined chat identity and polling fallbacks.
- Added `docs/product-refresh-plan.md` and `docs/performance-plan.md`, which now prioritize a production baseline before selecting a load target.

Migration `0046_persistent_moments_and_shared_notes.sql` has not been applied remotely, and the app has not been deployed. The Cloudflare/Supabase service plan has not been scaled; there is no application server VM in this deployment to resize. The 100-session workload has not been measured. Automated tests, typecheck, and build were not run for this pass.

## 2026-10-10, 03:00: the landing page is what a visitor sees first, at every address

The owner looked at the live site and said the page that explains the app only appeared after pressing "Ứng dụng này làm gì?" on the sign-in screen, which draws nobody in; they asked for that page to be the main one, with a sign-in button that leads to the sign-in screen. The cause: the page was shown at `/` only. Every other address showed the sign-in form, and that is where a person is after signing out, or after following an invitation's link.

| Where | Before | Now |
|---|---|---|
| Signed out in a browser, any address but `/login` | The sign-in form, except at `/` | The landing page |
| The page's sign-in buttons | "Đăng nhập" as plain text in the top bar, "Bắt đầu" under the opening lines and at the end | A filled "Đăng nhập" button in the bar that stays at the top, and "Đăng nhập để bắt đầu" under the opening lines (the full width of a phone) and at the end |
| Where sign-in leads back to | The address the form was shown at | The address the landing page was shown at, handed to `/login` as router state. A reload of `/login` keeps it |
| "Ứng dụng này làm gì?" on the sign-in screen | Led to `/` | Leads back to that address. It is not shown after a sign-in that failed, where it led nowhere |
| The installed app, a failed return from a sign-in | The sign-in form | The same |

This differs from the table "Who sees it" in `docs/feature-plan-2.md`, which sent every address but `/` to sign-in. Files: `src/app/AuthenticatedApp.tsx`, `src/app/landing/LandingPage.tsx`, `src/modules/identity/presentation/AuthPage.tsx`, one new text in `src/kernel/locales/en.ts`.

Checked: `npm run typecheck`, 240 unit tests, the browser suite (98 tests on the dev server; four of them were changed for the new first screen, in `e2e/landing.spec.ts`, `e2e/ui.spec.ts` and `e2e/account.spec.ts`), and `npm run build` (the landing chunk is 8 kB gzip). The run on the production build was not repeated. Pictures at 320, 390 and 1,280 px and in the dark look were read; at 320 px the top bar first broke onto two lines, which is corrected. Not deployed: `npm run deploy` is the owner's to run, and it needs nothing on the database.

## 2026-10-10, 02:45: plan 2 is on the cloud

The owner ran the three commands of `docs/deployment.md` in the night and asked for a check. What was read between 02:40 and 02:43, from this machine:

| Read | Answer |
|---|---|
| `db push --linked --dry-run` | "Remote database is up to date": 0039 to 0044 are applied |
| `functions list` | `process-reminders` and `send-test-push` at version 5, changed at 02:38:58; `delete-account` at version 4, changed at 02:40:17; `calendar-feed` as before |
| `https://9try.gnouht.space/` | Its `index.html` is the same bytes as `dist/index.html`, built here at 02:39 from the working tree with the review of the entry below, and so are the eight script and style files it names. `/map/light.json` and `/map/dark.json` are the repository's. `/og.png` is there |
| The push key | The chunk of the live site that asks for push holds the public key of `.env.local` |
| The public API, asked without a session | `import_calendar_events`, `list_moments`, `search_messages`, `list_expense_books` and `my_features` are refused with 42501. A function the API did not know would answer PGRST202 |
| A browser at 390 px, signed out | `/` is the landing page and no wider than the screen, `/login` and `/chat` show sign-in; no error in the console, no failed request |

Not read: the two buckets, the job `moments-expire`, the vault's entries for the worker, and whether the database reaches the worker. The one query that would say so (`db query --linked`, a single select) was refused by Claude Code's permission check as a read of production. What speaks for them: the buckets and the job are made inside 0040 and 0042, which are applied whole or not at all; and `scripts/setup-push.mjs` stops before it deploys the web app when the worker or the database's call to it fails, while the site was deployed two minutes after the functions. That holds unless the web app was deployed by a separate `npm run deploy`. The dashboard shows the buckets under Storage and the job under Integrations, Cron.

Nothing was used signed in on the cloud from here: posting a photo, a photo in a chat, typing, a shared book, a push on a phone.

Migrations 0039 to 0044 are now history on the cloud. A correction to anything in them is a new migration, 0045 or later, not a change to those files. The tree is still uncommitted, so the build that is live exists only in this working folder.

## 2026-10-09, 23:00: a review of plan 2 before it goes to the cloud

The owner asked for the work of the entry below to be gone over for errors and improved. The cloud was read once more (22:38, `db push --linked --dry-run`): still at 0038, so what was found in migrations 0040 to 0042 was corrected in those files, and the local stack's database was given the same changes by hand. Nothing is committed and nothing was deployed.

### What was found and changed

| Where | What was wrong | Now |
|---|---|---|
| `post_moment` (0040) | A photo posted with a list of chosen people that was empty, or named only the poster, went to every friend | A list is never widened. An empty one is for nobody. The app sends `null` for "every friend" and nothing else means that |
| The form to post a photo | A friend chosen last time, since unfriended, stayed in the remembered list: the server refused every photo "for chosen people", and the name was not in the list to untick | People who are no longer friends are left out before the photo is sent. With nobody left, "Đăng" is off |
| Posting a photo | When no answer came back, the uploaded file was removed although the photo might have been posted, which would leave a photo without its picture | The file is removed only when the server refused the photo. A file that ends up without a photo is the worker's to remove |
| Photos in chat (0042) | Every file of a conversation could be read by its participants, also the photo of a message that was taken back, until the worker removed the file within the hour | A photo is read while a message names it. Taking the message back refuses the photo at once. Whoever added a file still reads it, which an upload that is not sent yet needs |
| Search in a conversation (0041) | "an toi" did not find "Ăn tối" | `private.unmarked()` compares both sides without Vietnamese marks, as the app's own search does |
| "Đã xem" | A thread left open in a tab nobody was looking at marked every new message as read | A thread marks itself as read only while its page is on screen, and when it comes back on screen |
| A message that fails to send | Its words came back into the box; its photos and its card were lost | All three come back, where nothing took their place meanwhile |

Looked at and left as it is: a signed address of a photo keeps working for up to an hour after the photo stops being readable; someone in a conversation can send "is typing" under another participant's id; an open thread reloads every page it has loaded each five seconds; a member who leaves a group's book stays in the group and is not let back in by themselves.

The .ics reader was tried with eight more shapes of file (a weekly class whose start date is not on its weekday, two weekdays with a count, daily on weekdays, a duration in place of an end, three all-day days, a monthly rule on another day than it starts, a week start, a skipped date written in UTC) and read each of them correctly; nothing was changed there.

### What was run

| Check | Result |
|---|---|
| `npm run typecheck`, `npm test` | Pass; 240 tests |
| `npm run test:db` | 657 assertions in 28 files pass. `moments` has 51, `chat_actions` 66 |
| `moments` and `chat_actions` on the local stack's Postgres, with its real `storage` schema | 116 of 117; the one that fails counts a realtime event |
| `npx playwright test --workers=3` | 98 tests pass. New: chosen people who are no longer friends, the read mark of a page that is not on screen, and inside the phone test of the chat a message that fails and goes through on the second try with its photo |
| `npm run test:e2e:preview` (the production build), before these changes | 96 of 96 |
| `npm run build` | Passes; `dist/` is the build for the cloud project again |

Unchanged from the entry below: what was not checked, and what is left for the owner, in the same order.

## 2026-10-09, 22:30: feature plan 2 is built; the cloud waits for the database push

The owner asked for the whole of [feature-plan-2.md](feature-plan-2.md) to be carried out and deployed. Phases 1 to 7 are built on the local branch `refactor/foundation`. Nothing is committed. Nothing of it is on the cloud: the database push was refused by the permission check of the tool this work is done with, and the rest of the deploy was not started, because the new site must not go out before the database (see "Left for the owner").

### What was built

| Phase | What a person gets | Where |
|---|---|---|
| 1. .ics import | A timetable or a calendar export arrives whole: repeating events as series with their skipped and changed dates, other rules as dated events for a year ahead, events without a title or an end, UTF-16 files. One unreadable event is left out with its line number. The preview says what will be added and what will not, and why. The card is also on the timetable screen | `calendar/domain/ics.ts`, `IcsImportCard.tsx`, migration 0039 |
| 2. Landing page | A visitor at `/` reads what the app is, how a day with it goes, its screens, who sees what and how to install it, with drawings that follow the look. `/login` is the sign-in screen | `src/app/landing/`, `index.html`, `public/og.png` |
| 3. Photos on Mode | A frame at the top of Mode: post a photo with a caption and a mode, for all friends or chosen ones; look, react, reply in the chat; who looked. Gone after 24 hours | `src/modules/moments/`, `kernel/image.ts`, `kernel/files.ts`, migration 0040, the worker's sweep |
| 4. Chat | Reply, six reactions, edit within 15 minutes, unsend, "Đã xem", typing, day lines, an unread line, links, drafts, mute, search, up to six photos a message, and cards for an event, a meetup, a live location and a photo | `src/modules/chat/`, migrations 0041 and 0042 |
| 5. Shared expense books | Several books; other accounts as editor or viewer, by invitation or as a whole group; an invited friend can take over a name of the book; balances and the fewest repayments for more than two people; an even division among some of them; history with names | `src/modules/expenses/`, migrations 0043 and 0044 |
| 6. Map look | Two map styles in the app's colors, one for each look; friends as faces with the ring of their mode and their name; a card for each with a way to write to them; rounded controls; markers that glide; on a phone the map has the screen and the rest is a sheet with three heights | `location/presentation/`, `public/map/`, `scripts/build-map-style.mjs` |
| 7. Release pass | The documents next to this one | `docs/`, `README.md` |

### What differs from the plan

- The owner's own .ics file was not at hand. The reader was built against hand-written files in the shapes the plan names.
- The photo viewer does not move on by itself, so there is nothing to pause by holding.
- The ledger's screens keep their addresses `/expenses`, `/expenses/stats` and `/expenses/settings` and remember which book is open; `/expenses/<book id>` opens a book. The plan had an address for each book.
- The chat's new database tests are a file of their own, `chat_actions.test.sql`. `Thread.tsx` was split into `MessageBubble`, `MessageMenu`, `Composer` and `ConversationInfo`; there is no `MessageList`.
- A reaction to a photo reaches the inbox and has no line of its own in the push settings; it is not pushed.
- `scripts/local-two-user-check.mjs` was not extended for photos, typing and "Đã xem", and was not run: the local stack's Storage and Realtime services answer 503 on this machine. Only its map stand-in was changed.
- The map's dark look gives the roads `--soft` and the houses `--surface`, the other way round from the light look, because in the dark palette `--soft` is the lighter of the two. Minor roads are the border color mixed with the land color in both looks.
- Positron's design license is CC-BY 4.0 (derived from CARTO's basemaps under CC-BY 3.0), read from its `LICENSE.md` on 2026-10-09; the plan said CC-BY 3.0. The notice is in the two style files and in `README.md`.
- On a phone the legend of the map is at the foot of the sheet, and the lines about the viewer's own position are at its top; on a desktop those lines moved from under the map to the top of the column beside it.
- `.env.local` on this machine set `VITE_MAP_STYLE_URL` to OpenFreeMap's liberty style, which would have kept the old look in every build. The line was removed from `.env.local`, and `.env.example` now has it as a comment.

### What the tests found on the way

- Changing a member's role in a book sent the old role: the field's value was read after React had drawn the stored role again. It is read before the call now.
- On the map, Enter on a friend's marker never opened the card, also before this work: MapLibre takes its key listener off a marker when the marker is put on the map, so the card is now attached after that.
- The stylesheet lifts whatever holds an open `<details>` to `z-index: 20`, and MapLibre's credits are one. The sheet lay under the map for a pointer until it was given a higher place.
- A phone-wide message menu opened off the screen, a bubble shrank to its text's width, and "Thu hồi" read "Revoke" in English; all three are fixed.
- Deleting a book, or the account of an owner whose book has entries, failed on four foreign keys. They cascade since 0043.

### What was run on 2026-10-09

| Check | Result |
|---|---|
| `npm run typecheck` | Passes |
| `npm test` | The map styles match the tokens; 239 tests in 34 files pass |
| `npm run test:db` (embedded Postgres, migrations 0001 to 0044) | 651 assertions in 28 files pass. New: `calendar_import` 27, `moments` 48, `chat_actions` 63, `shared_expense_books` 81. `private_expenses` keeps its 47; one of them now expects `my_features()` to say both `couple_expenses` and `expenses` |
| The same files on the local stack's Postgres | 628 of 651 pass. The 23 that fail, in 11 files, each count a realtime event, and the local Realtime service is down: `calendar_import` 11, `chat` 10, `moments` 33, `shared_expense_books` 52, and 19 in the eight files that failed for this reason before |
| `npx playwright test --workers=3` | 96 tests pass. New: `landing` 7, `moments` 4, `chat` 4, six more in `expenses` (an editor, a viewer, an invitation, the owner managing people and books, three people, English), three more in `map` (faces and cards, the look, gliding), and the phone test of the map rewritten for the sheet |
| `npm run build` | Passes. The landing page is 7.9 kB gzip, the entry chunk 66.8 kB, the chat screen 12.7 kB, the map page 6.7 kB beside MapLibre's own 285 kB |
| Every call of a database function in `src/`, `supabase/functions/` and `scripts/`, against the functions of the local database | 132 calls of 111 functions name a function that exists, only arguments it has, and every argument it has no default for. One call builds its arguments in a variable and was read by eye |
| Screens looked at as screenshots, 390 px and 1,280 px, light and dark | The landing page, Mode with the frame, the photo page and its form, a chat thread and the composer, the ledger's three screens and the dialog for a new book, the map before and after with OpenFreeMap's real tiles, its card and its sheet at three heights. The pictures were in a scratch folder that a restart emptied |

### What was not checked

- Anything on the cloud beyond one read: at 22:33 `db push --linked --dry-run` listed 0039 to 0044 as not applied.
- Uploads and signed addresses against a running Storage service, and typing over a running Realtime service. The storage rules are tested as SQL on the local stack's real `storage` schema, and the browser tests answer the Storage API themselves.
- `npm run test:e2e:preview` and `npm run test:push:local` were not run again after this work.
- Real phones: the camera from "Đăng ảnh" in the installed app, a push for a new photo, the sheet under a finger, the card a chat app draws for the site's address.
- OpenFreeMap's server under load, and the map with more than a few dozen friends in its new look. The earlier 50-friend test still passes.

### Left for the owner

In this order, with Node 22 on the PATH. `docs/deployment.md`, "Putting the work of feature plan 2 on the cloud", says what each one needs and how to read the result.

```bash
npx supabase@2.119.0 db push --linked
npm run push:setup
npx supabase@2.119.0 functions deploy delete-account --use-api
```

The first has to come first: the new build sends messages through `post_message` and opens the ledger through `list_expense_books`, and a site deployed before 0041 and 0043 cannot do either. After the three, the things only a phone can show are the list above. The work is in the working tree since `ac6a859`, more than 200 paths; committing it is the owner's word.

## 2026-10-09, 14:00: a second feature plan, approved and not started

The owner asked for six things (a landing page with drawings, more chat features, a photo frame on Mode after Locket, a softer map, the .ics import that failed for them, expenses shared with a partner or a group) and for a detailed plan in English. The plan is [feature-plan-2.md](feature-plan-2.md). The owner approved it the same day. No code, migration or cloud setting was changed for it.

Four answers of the owner are written into the plan: a "fund" is a split ledger and not a pooled fund; only an account with the capability creates a book; the .ics import lost events and showed an error whose text was not kept; photos on Mode are deleted after 24 hours.

The state of the work is still the entry below. The two commands it leaves to the owner (`db push` for migration 0038, then `npm run push:setup`) are Phase 0 of the new plan, and its photo phase needs them.

## 2026-10-09, morning: push notifications, set up by one command and sent for real on one machine

The owner ran the database push and the function deploy of the entry below, then asked for push notifications to be carried on. Local branch `refactor/foundation`; nothing here is committed. Nothing in this entry changed the cloud project.

### What was on the cloud (read 2026-10-09, 09:07 to 09:10, without changing anything)

| Question | Answer | How it was read |
|---|---|---|
| Migrations | 0001 to 0037, none pending | `supabase migration list --linked` |
| Edge Functions | Four, all active, deployed at 09:04 | `supabase functions list` |
| The functions' secrets | Only those the platform sets itself. No `CRON_SECRET`, no `WEB_PUSH_*` | `supabase secrets list`, names only |
| Extensions and scheduled jobs | `pg_cron`, `pg_net` and the vault are on. The seven jobs exist, `push-worker` among them | One `select` |
| The vault | No `push_worker_url`, no `push_worker_secret` | Names only |
| Push in use | No device signed up, nobody with push on, 13 entries waiting in the queue | Counts |
| The deployed worker | Answers "unauthorized" to a caller without the secret, so it starts and its imports load on the hosted platform | One request without credentials |
| The live site | Still the deployment of 2026-10-08, 12:19. `dist/` was built at 09:04 on 2026-10-09, but no deployment was made after it | The chunk names of the live page, `wrangler deployments list` |

So the database and the functions of the entry below are live, the site is not, and push had nothing it needs: no key pair, no secret, and the database did not know where the worker is. After these reads the tool this work is done with refused further reads of the cloud project as well, so none of it was read a second time.

### One command for the owner: `npm run push:setup`

`scripts/setup-push.mjs` does what `docs/deployment.md` listed as six steps with secrets copied by hand:

- It makes the key pair and the worker's secret, sets them as the functions' secrets, deploys `process-reminders` and `send-test-push` from this folder, stores the worker's address and secret in the vault, asks the worker and then the database whether they agree, writes the public key into `.env.local`, and runs `npm run deploy`.
- No secret is printed, and none is written into the repository. They are handed to the Supabase CLI in two files in the system's temporary folder, readable by the account only, deleted when the command ends.
- It reads everything before it changes anything, and stops without a change when `.env.local` is for another project than the linked one or the CLI lists secrets in a form it does not know.
- Running it again keeps the key pair. It can tell, because the CLI shows each secret as the SHA-256 of its value: the public key in `.env.local` either has the project's digest or it does not. A pair is replaced only with `--new-keys`.

It was not run against the cloud project. It was run in twelve situations on a bench: the CLI's cloud commands were replaced by a stand-in that keeps the "project's" secrets in a file and sends the SQL to the local database, the worker by a stand-in that knows those secrets, and `npm run deploy` by a stand-in build. The vault and `pg_net` in that bench are the local stack's real ones, so `private.kick_push_worker()` really read the two entries and really called the stand-in with the secret. The twelve: a project without keys; a second run; the public key lost on this machine; `--new-keys`; the CLI answering in its other form; the deploy failing; a build without the key; `.env.local` for another project; a contact address no push service takes; an `https` contact; a database that cannot reach the worker; a worker that is down. After each run that should succeed, the stored pair was checked with the `web-push` library the worker uses (it takes the keys and signs a request with them), the vault held exactly the two entries with the functions' secret, the output held no secret, and the temporary folder was gone. The script changed after those runs (it now deploys the two functions, and asks the CLI for the form of answer that was read from the cloud project); six of the situations were run again with the final script, and a failing function deploy was added.

### Real pushes on this machine: `npm run test:push:local`

Until now a push had only been sent to a stand-in for a push service. `scripts/local-push-check.mjs` sends real ones, on one machine, without the cloud project:

- The app is built as for production, with its service worker, for the local Supabase stack and with a key pair made for the run.
- Two accounts are made in the local Auth. One of them is opened in a browser with a profile on disk (a private window gets no push), where "Bật thông báo đẩy" signs up with the push service that browser uses.
- `process-reminders` and `send-test-push` run on Deno 2.9 as they are in the repository. The local vault gets the worker's address, so the database calls it through `pg_net` as it would on the cloud.

What it saw with the final code (2026-10-09, 10:20): 35 checks passed and one was skipped.

- "Bật thông báo đẩy" signed the browser up with a real push service, and the device was stored as "Chrome · Linux" with its language.
- "Gửi thông báo thử" was taken by the push service, and the service worker showed the notification.
- A friend request from the other account was on the screen as a notification 1.0 s after it was sent. A chat message, sent while no page of the app was open, was pushed 2.5 s later and shown by the service worker alone, without the message's text. In the other runs these took up to 4.1 s and 7.1 s.
- A second message in a conversation that is still unread was not pushed again. After the notification was marked read in the inbox, the next message was (the fix below).
- A tap on a notification took the open app to the conversation. A link that would leave the app led to the inbox.
- With the app switched to English the next push was in English. With the private preview on it named nobody. In quiet hours, and for a kind that was turned off, nothing was pushed and the inbox still got the notification.
- A device signed up under another key pair signed up again when the app started, and a push reached it at its new address.
- A browser that does not allow notifications was told so, and no device was stored.

Skipped: "an address the browser gave up is removed". The push service still took a push for that address, so there was no refusal to act on. In an earlier run that morning it refused at once and the device left the list.

The push service of the test browser (Google's, at `jmt17.google.com`) was not reliable that morning. Of eight runs of the whole check, two passed from start to end: one before the last changes (33 of 33 checks) and the one above. Two stopped at the first push because the push service refused an address it had given out seconds before (404 or 410); two because it took the pushes and delivered none; one was the run that found the missing notification described below; one met the failure described next. The check tells this apart from a failure of the app: when the first push does not arrive it says "NOT CHECKED" and ends with code 2.

One of those failures was the worker's to handle. Sending from the worker's process after it had been idle for about 20 seconds, opening the connection to the push service timed out after half a second (`ETIMEDOUT`, an error without a message); this was reproduced apart from the app, with the worker's library on Deno. The device then showed "0" as the reason, and the queue waited two minutes for its next try, as designed. Whether the hosted platform has the same half-second limit was not found out.

### What changed in the app

- **A message after the inbox was read (migration 0038).** A conversation has one notification while it is unread, and that row was removed only when the conversation was opened. Someone who marked it read in the inbox, without opening the conversation, kept the row; every later message found it and told nothing, no entry in the inbox and no push, until the conversation was opened. `send_message` now removes a notification that was read before it writes the new one. The real pushes found this: the check marked notifications read the way "Đánh dấu đã đọc" does, and the pushes after that never came.
- **The permission question comes first, inside the tap.** "Bật thông báo đẩy" used to start through a mutation and waited for the service worker's registration before it asked the browser for permission. iPhone and iPad ask only in direct answer to a tap. The button now starts the work in its own handler, and the question is the first thing that work waits for. This was not tried on an iPhone or iPad; on Chromium the flow is unchanged.
- **A push service that was not reached is tried again at once.** `sendToDevices` sends a second time when the first try got no answer at all, before the queue's two-minute wait. Had the first try arrived after all, the second replaces it on the device, because both carry one tag. A failure without a message is now named by its code ("ETIMEDOUT") in the list of devices.
- **A replaced key pair mends itself.** A device signed up under an old key pair is refused by its push service for ever. When the app starts and its build's key is not the one the browser signed up under, it now gives the old sign-up up and signs up again. Without this, `--new-keys` would have left every device silently dead until its owner turned push off and on.

### Checks

| Check | Result |
|---|---|
| `npm run typecheck` | Passes |
| `npm test` | 202 tests in 33 files, three of them new (the second try, the code as the reason, no second try after an answer) |
| `npm run test:db` (embedded Postgres, 38 migrations) | 24 files, 432 assertions; two new ones in `chat.test.sql` |
| `npm run test:db:local` (local Supabase Postgres, 0038 applied there) | 16 of 24 files, 413 of 432 assertions. The 19 that fail are in 8 files and all count realtime events: the local stack's Realtime service is not running, so its table has no partition for 2026-10-09 (UTC) and every event of that day is dropped with a warning. On 2026-10-08 (UTC) the same files passed. The account these tests use may not create the partition. Nothing of this entry touches realtime events; the two new assertions pass there |
| Browser tests on the dev server, 3 workers | 71 passed |
| `npm run build` | Passes; `dist/` holds a build for the real project |
| `npm run test:push:local` | See above |
| `deno check` on the four functions (Deno 2.9.7) | Not finished: `jsr.io` answered 403 to this machine when Deno fetched the type files, which running the functions does not need. The two functions ran on Deno in the check above. `_shared/pushQueue.ts`, where the second try is, passes `tsc --strict` by itself; `_shared/webPush.ts` (three changed lines) was not type-checked |
| `npx wrangler@4 deploy --dry-run` | Reads 140 files from `dist/` and stops; the site's deploy configuration is in order |

`npm run deploy` now runs `npx --yes wrangler@4`, so it does not stop to ask before fetching a newer wrangler. Why the owner's deploy of 09:04 made no deployment is not known.

### Not verified

- `npm run push:setup` against the cloud project, and any push through it: the hosted functions with their secrets, `pg_net` and the vault there.
- A push on a phone: Android, and an iPhone or iPad with the app on the Home Screen. Their push services and rules are their own; the check above is desktop Chromium. The reordered permission question is aimed at iPhone and was not tried on one.
- The database tests that count realtime events, on the local database, since its day changed (see the table above). Restarting the local stack brings its Realtime service and the partitions back.
- The push service of the test browser was unreliable during this work, see above. Whether the push service of an ordinary Chrome ever refuses an address it has just given out was not found out. If it does, the server removes that device and the app puts it back when it is next opened.

### Left to the owner

With Node 22 on the PATH, in this order:

```bash
npx supabase@2.119.0 db push --linked     # migration 0038
npm run push:setup                        # the keys, the secrets, the two push functions, the vault, a check, and the site deploy
```

Then on each device: open the app, reload once, Cài đặt → Thông báo đẩy → "Bật thông báo đẩy" → "Gửi thông báo thử". On iPhone and iPad the app has to be on the Home Screen first. `docs/deployment.md`, "Push notifications", lists what the command says when something does not answer.

## 2026-10-08, afternoon: the app development plan (`docs/app-development-plan.md`)

The owner asked for the plan in `docs/app-development-plan.md` to be carried out, and on 2026-10-09 to finish it and deploy the app. The work went on until 2026-10-09, about 02:00. All phases are built and checked on this machine. On 2026-10-09 at 02:00 nothing of it was on the cloud yet: the tool this work is done with refused the database push as a production deploy, so the three commands are the owner's to run. They are in "What is on the cloud" at the end of this entry. Local branch `refactor/foundation`; nothing here is committed or pushed.

### Phase 0: what is deployed (read on 2026-10-08, about 15:10, without changing anything)

| Question | Answer | How it was read |
|---|---|---|
| Migrations on the cloud project | 0001 to 0030, none pending | `supabase migration list --linked` |
| Edge Functions on the cloud project | None | `supabase functions list` |
| The live site | A build with the language switch, so the English commit or a later one | The chunk names in the live `index-*.js` |
| Push key in the build | Not set: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` is empty in `.env.local` | Key names only, no values printed |
| Server secrets for push (`CRON_SECRET`, VAPID pair) | Not set in `.env.local`; whether they are set on the cloud project cannot be read from here | — |

So push cannot reach any device today: there is no worker, no scheduler and no key. The plan's first step for push ("verify their deployment and configuration") has this answer. A performance baseline on a real phone was not taken; no phone was at hand.

Before any change: `tsc -b` passed, 134 unit tests, 189 database assertions on the embedded Postgres.

### Phase 1: navigation, a fast new event, the profile

Navigation (plan section 1):

- A phone's bottom bar has five screens: Mode, Lịch, Trò chuyện, Bản đồ, Menu. The row of a tab's other screens under the top bar is gone. The strip of a screen's own tabs ("Việc · Thói quen · Ghi chú") stays.
- The Menu (`/menu`) lists top-level destinations by part of the app, three to a row on a phone. Child screens stay in a strip under their parent; notifications and profile/settings use their fixed top-bar controls.
- The sidebar, bottom bar, Menu, shortcuts and search read the modules' navigation entries. A screen says with `primary` that it belongs in the bottom bar. `src/app/modules.test.ts` checks the Menu's top-level list, parent tabs and routes.
- Today starts with a card of shortcuts. "Sửa" turns it into the list of screens that can be pinned, to tick up to eight. The choice is kept on the device, for the account.

A new event (plan section 5, first half):

- The form is a short sheet: a name, four templates (Cà phê, Ăn tối, Học bài, Hẹn hò), four times (Bây giờ, Tối nay, Ngày mai, Cuối tuần này), three lengths, friends to tick, one button. All-day, a custom end, the place, repetition and "a group or everyone" are under "Tùy chọn khác".
- A line above the button always says who will see the event. Ticking a friend shares it with them; the friends and places of the last events are offered first and never chosen for the person.
- An event has "Nhân bản": a copy with the same name, time, length and place, private. The Mode screen has "Lên lịch" on the activity that is on, which opens a new event with the activity's name (`/calendar?new=…`).
- Already there before this work and unchanged: a tap on an empty slot of the hour grid, a free time that becomes a proposal, a confirmed meetup shown once on the calendar through `agenda`.

The profile (plan section 8, first half), migration 0032:

- A picture: chosen from the device, cut to a square with a drag or three sliders, stored as a JPEG of 160 px inside the profile row. The database refuses anything else, in particular a web address: a picture on someone's own server would tell that server who looked. Removing and replacing work the same way.
- The top of the screen shows what friends see. The username is checked a moment after typing stops. The introduction counts its characters. The form says "Có thay đổi chưa lưu" or "Mọi thay đổi đã được lưu", saves only when something changed, and can drop the changes.
- Found on the way: the form was filled again on every reload of the profile, and the query cache reloads whenever the app comes back to the front, for example from the phone's photo picker. Typing was lost. The form is now filled once.
- Who sees the introduction (friends, or only the person) and the birthday (only the person, or friends, as day and month) is chosen in the form. A friend's name in the friends list opens their card, which the server builds: no row for a stranger, an ex-friend or a blocked person, and never the year of birth.
- Pictures are shown in the account menu, the friends list and the rings of the Mode screen.

Not done in phase 1: a usability test of "an event in under 15 seconds" with a person (the short path is two actions: a name and the button). The audit of Friends, Groups, Today, Tasks, Notes and Settings was done last and has its own section below.

### Phase 2, first part: whether the app is open (plan section 2), migration 0033

- Three things stay apart on screen: the activity mode (what someone says they are doing), the presence ("Đang mở ứng dụng", "Vừa mở ứng dụng", "Mở ứng dụng lần cuối 14:05", or "Không rõ trạng thái") and the freshness of a shared location. The app never says "online" or "offline".
- Off for everyone until they choose: nobody, every friend, or the friends they tick, and separately whether the time they were last seen is kept at all. The card is on the privacy screen.
- While the app is on screen it tells the server every 30 seconds. A tab that is hidden or closed says goodbye with a request that outlives the page; a tab that just stops calling counts as inactive after 90 seconds. Several tabs or devices are one person: the last one to leave makes them inactive.
- The server stores one row per open tab, dropped 15 minutes after its last sign of life, and one time of last activity per person, only while they show it. There is no history.
- Who may see whom is looked up on every read. Changing the setting, unfriending and blocking take effect on the next read, and the other person's screen is told to reload. A friend who may not see someone gets no event either, because the moment of an event would say when the app was opened.

### Found on the way: nobody could read the meetup tables on a real database (migration 0031)

The policy on `meetups` asks `meetup_invitees` whether the person is invited, and the policy on `meetup_invitees` asks `meetups` whether the person is the organizer. Postgres refuses every read that starts such a circle: "infinite recursion detected in policy". This has been so since migration 0001. Read as a signed-in user on the local Supabase Postgres (migration 0030, nothing changed there), five tables failed: `meetups`, `meetup_invitees`, `meetup_time_options`, `meetup_votes`, `meetup_comments`. The app lists a person's meetups by reading `meetup_invitees`, so on the live site "Hoạt động" cannot have loaded for anyone; the calendar, the Mode screen and the statistics silently left meetups out. The browser tests run on a stand-in for the server, and no database test read these tables as a signed-in person, so nothing caught it.

Migration 0031 answers the two questions with functions that look the row up directly, as 0013 did for locations. Who may read what is unchanged. It is the first new migration, so it can be put on the cloud database by itself. `meetup_policies.test.sql` reads the tables as the organizer, a guest, a member of the meetup's group and a stranger, and has one assertion that no table of the app fails when a signed-in person reads it.

### Phase 2, second part: asking to see a friend's schedule (plan section 5), migration 0034

- A friend's calendar has "Xin xem lịch". The friend answers on a new screen, "Chia sẻ lịch" (`/calendar/requests`, a tab of the calendar; the calendar's entries in the navigation count the questions that wait): no, or yes with what is shown, which days, and for how long. A yes without touching anything gives the least: busy times only, two weeks from today, for seven days.
- Nothing can be read before the yes. The permission is one row per owner and viewer, written only by the owner's answer. It is listed on that screen and on the privacy screen, each with "Thu hồi".
- What a permission shows is counted out by the server: one row for each time something happens, never outside the granted days. A repeating event is not sent as a rule, because the rule would also tell the other days. Names come only with a permission for names; places and notes are never sent.
- A question lapses after 14 days. A second question while one is open is refused, so is one within a week of a no, and the twenty-first in a day. Unfriending or blocking ends permissions and withdraws open questions.
- "Rảnh lúc nào?" also uses a permission when it covers every day of the search. One that covers fewer days is not used: the other days would look free.

### Phase 2, third part: push (plan section 3), migration 0035

The database side:

- The worker takes the queue through `claim_push_batch` and closes each entry with `finish_push`, so the rules are in SQL and tested there: no push for a notification that was already read, for a kind the person turned off, or in their quiet hours; a refusal is tried again after 2, 4, 8 and 16 minutes and then given up; an address a browser gave up (404, 410) is removed; each device keeps when a push last went through and what it last answered.
- The database calls the worker itself, at once when a notification is written and every minute for what is scheduled (`pg_net`, `pg_cron`). It needs the worker's address and secret in the vault; without them nothing is called and the inbox works as before.
- New things are told: a pinned friend turns a mode on (only for someone who turned that alert on; changes within a minute are one alert, and a mode turned off before the alert went out leaves nothing), an event is shown to a friend (once per event) or changes while it is shown (once per burst), a confirmed meetup or a one-off event is 30 minutes away.
- A reminder is looked at again when it is due: one for a cancelled or moved meetup, or for an event no longer shown to the person, is dropped. When an event is taken back from a friend, what was said about it leaves their inbox.
- A notification about a meetup opens that meetup instead of the list.

The worker (`supabase/functions/process-reminders`, `send-test-push`, shared code in `_shared/`):

- A push is written in the language of the device it goes to. With "Ẩn nội dung trên màn hình khóa" it says only that something arrived. A link in a push is followed only when it is a plain path of the app, in the worker and again in the service worker.
- The table of what the database writes into notifications, with the English, is one file now (`_shared/notificationTexts.ts`). The inbox and the worker both read it.

The app (settings, "Thông báo đẩy"):

- A list of what push needs on this device, each with whether it is there: a browser with push (and on iPhone and iPad, how to install first), a build with the key, the permission (and where to unblock it), the sign-up.
- The person's devices by name ("Chrome · Android"), each with what its push service answered last, and a way to remove it. Turning push off on one device leaves the others on.
- "Gửi thông báo thử" pushes to every device at once and shows each device's answer.
- Which kinds are pushed, the quiet hours as before, the private preview, and the alert about pinned friends' modes.

Found on the way: `delete-account` answered a browser's first question (the OPTIONS request) with "method not allowed" and no headers, so a browser would have dropped the real request even with the function deployed. Both functions the app calls now answer it. This was not tried on the hosted platform: no function is deployed there.

How the worker was checked without a phone: its handler on Node with the database and the push services replaced (11 tests); `deno check` on all four functions with their real imports; and one run on Deno 2.9 against a local stand-in for the database's two calls and for a push service, over TLS. In that run the worker took one entry, sent an `aes128gcm` push with a VAPID signature and a one-hour lifetime to two addresses, and reported 201 for one and 410 for the other.

Not verified: a push on a real device of any kind (Android, an installed iPhone app, a desktop); `pg_net` and the vault on the cloud project; the functions on the hosted platform.

Left to the owner for push to work: make a VAPID key pair, put the public key in `.env.local` as `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` and deploy the app; set `CRON_SECRET` and the three `WEB_PUSH_*` secrets for the functions and deploy `process-reminders` and `send-test-push`; store the worker's address and `CRON_SECRET` in the vault. The exact commands are in `docs/deployment.md`.

### Phase 3: the private expense ledger (plan section 4), migration 0036

Who has it:

- A capability, `couple_expenses`, in a table that accounts can neither read nor write (`feature_grants`). It is given and taken back with `private.grant_feature` / `private.revoke_feature`, which the API does not expose.
- The migration gives it to the account whose username is `tk1ll3r` at the moment it runs, by that account's user id, and prints the id and the address the account signs in with. If no such account exists it grants nothing and prints how to grant later. A grant lets an account keep a ledger of its own; it opens nobody else's.
- Every read and every change asks two things: the capability, and that the book is the caller's own. Row level security asks it for reads and for the small lists; the functions ask it for expenses and repayments. The partner is a name in the book and gets nothing by being named.
- The app lists the three screens (`/expenses`, `/expenses/stats`, `/expenses/settings`) nowhere for other accounts: sidebar, Menu, shortcuts, search. Their addresses lead home, as an unknown address does, and the app asks the server nothing about a ledger for them.

What it does:

- An amount, who paid, Save. The amount is read as people type it: `600000`, `600.000`, `600k`, `1,5tr`, `1tr2`. The day is today and the amount is divided the book's usual way. The day, a category, an outing (a new one is made by typing its name), a note and the division are under "Thêm chi tiết".
- Three divisions: evenly (an odd đồng stays with the one who paid), all on the one who paid, or typed parts that must add up. The server checks the parts again and refuses a part for someone outside the book.
- "Ai nợ ai" counts every expense and every repayment. A repayment is recorded apart from spending. The plan's example is a test at three levels: 600,000 and 200,000 divided evenly leave the partner owing 200,000; paying it back leaves nothing owed and 800,000 spent.
- The list filters by day, category, payer and outing, and says what the filtered list adds up to. An entry opens to be changed; a change says which version it started from, so two devices cannot overwrite each other unseen.
- Numbers for this month, three months, the year or everything: spent, paid by each, each one's part, by category, and twelve months as bars.
- A CSV file with every expense and repayment, made on the device. A cell that a spreadsheet would run as a formula is disarmed.
- A history of every change with what the row was before and after. It is only ever added to; its owner cannot erase it.

"Tải dữ liệu của bạn" now includes the ledger, and what earlier migrations had added without adding it to the export: messages sent, pins, the activity mode, notification choices, the devices signed up for push (without their keys).

Checked: 47 database assertions (an account without the capability, a friend of the owner, and another keeper of a ledger each tried to read, write, export and guess ids; taking the capability back; no event about a ledger reaches anyone but its keeper), 16 unit tests of the arithmetic, the amount reader and the file, 4 browser tests.

Not done: an outing can point to a calendar event or a meetup in the database, but the app has no way to choose one. The book has its owner and one partner; more people would need a screen to add them.

Not verified: that the account named `tk1ll3r` on the cloud project is the owner's (the migration prints its id and address when it runs; compare them); the screens on a real phone.

### Phase 4: temporary conversations (plan section 6), migration 0037

- A room is a third kind of conversation, next to the one between two friends and the one of a group. It belongs to a meetup, to an event, or to a person's mode. Messages, unread counts, pages of older messages and notifications are the ones chat already had.
- The owner of the thing turns the discussion on, with a first message if they like: "Mở thảo luận" on the meetup's page, in the dialog of an event that someone else sees, and on the user's own mode. The people a meetup invites and the friends an event is shown to are told once. A mode's room is not announced; the friend's card on the Mode screen shows "Đang mở thảo luận" and a tap leads to the door.
- Joining is a step of its own: "Tham gia thảo luận" on the meetup, in the chat list under "Thảo luận đang mở", or at the room's address. Nothing can be read before it.
- Who may be in a room is asked again on every read and every message, from the thing itself. Someone taken off a meetup's invitation, or a friend an event is no longer shown to, reads nothing more, without anyone touching the room.
- A room closes a day after its event or meetup ends, or when its mode ends or changes; a cancelled meetup closes its room at once. The owner can close it sooner. A closed room takes no message, also from its owner and also through a direct call, and has no box to write in. It can be read for seven days; then the room and its messages are deleted, hourly, by the database.
- A member can mute the room (the unread count still shows) or leave it. The owner can take someone out, who then cannot come back.
- Each time a repeating event happens has a room of its own.

Checked: 46 database assertions (the organizer, a guest, a friend who is not invited, a stranger; muting; losing the invitation; removal; closing by hand and by the clock; the deletion after seven days; events shown to a friend and taken back; a room per time of a repeating event; a mode's room ending with the mode), 5 unit tests, 3 browser tests.

Not done: a room on an event shown to a group is open to that group's members, but they are not told when it opens; they find it in the chat list. An event on a friend's shared calendar cannot be tapped, so the way into its room is the notification or the chat list. A meetup keeps its older "Thảo luận" (comments that stay) next to the room (a chat that goes).

### Phase 5: the map (plan section 7), no migration

What the plan suspected was true, and was measured first. With 50 friends on the map and nothing moving, the page removed and created all 50 markers six times in 35 seconds: once for every tick of the "x giây trước" labels and once for every reload of the list.

- A marker is kept for as long as its person is on the map. A change touches only what changed: the position, or the look (fresh, old, rounded). A page that draws again hands the map the same list, and then the map does not run at all.
- The camera moves when someone asks (a friend's row, "Vị trí của tôi", "Xem tất cả") and once at the start, to show everyone. Once the person has moved the map by hand, that view is theirs: new friends, moved friends and reloads leave it alone.
- "Vị trí của tôi" asks the browser for the position when it is pressed, and not before. The position is a blue dot with a circle as wide as its accuracy. It lives in the memory of that screen (`useMyPosition`) and has no way to the server; sharing with friends is still the separate session a person starts. A refusal is said in words with what to do, and pressing again retries.
- Each friend's row gives the state (Đang cập nhật, Tạm dừng, Chưa có vị trí), the age and accuracy of the position, when the sharing ends, and the distance: "Cách bạn 770 m theo đường thẳng". The distance is worked out on the device. It is "khoảng" and in steps of 100 m when the friend shares a rounded position or the viewer's own position is known to 100 m or worse, and "tính từ vị trí cũ" when the friend's position is old. Nothing on the screen is a route or a travel time.
- On the map the three states look different: a dark badge that breathes, a dashed rim for a rounded position, grey for an old one. A legend under the map says so.
- On a phone the map takes 58% of the screen's height and the list of friends is folded under it, with its count in the heading. It opens with one press, and by itself when the map cannot load, so the people can always be seen. From six friends on, the list has a search that reads names without their marks. "Chia sẻ vị trí" at the top leads to the sharing form.
- Loading: however many friends move, the list is loaded at most once every three seconds (`spaced`); every position a friend sent used to reload it. The fallback timer is 15 seconds with people on the map and 60 with nobody. The banner "Đang chia sẻ vị trí" asked the server every 30 seconds on every screen for everyone; now it does so only while a session is open, and otherwise every five minutes and when the app comes back to the front.
- The lights behind the page stand still on a screen with a map. That was the costly animation, not the markers (numbers below).

Measured in headless Chromium on this desktop, software rendering, a window of 390×844, 50 simulated friends, dragging the map for five seconds:

| | Before | After |
|---|---|---|
| Marker elements created in 35 s with nothing moving | 300 | 0 |
| Frames a second, plain background map, motion on | 35 | 60 |
| Frames a second, real street tiles, motion on | 24 (the lights drifting as before, new marker code) | 49 |
| Frames a second, window of 1280×800, plain map, motion on | 20 | 56 |
| Frames a second with "reduce motion" | 60 | 60 |

With the 50 markers hidden the real-tile run gave 51 frames a second, so the markers cost about two. Clustering or a map layer is not warranted at this count and was not built.

Checked: 21 unit tests of the module (distance, rough distance, freshness, the spaced loader), 5 browser tests (the dot and distances with zero requests carrying the position; a refusal and a retry; fifty friends keeping their marker elements and the camera through a tick, a reload, a move, a leave and an arrival; the folded list, search and focus on a phone; the list opening when the map fails). Two of them were run against code broken on purpose (markers rebuilt, camera refitted) and failed as they should.

Not verified: a real phone. The plan's target, 45 frames a second on an agreed midrange phone, is not measured, and the numbers above say nothing about a phone's graphics chip. To measure it: `npm run dev -- --host`, then on the phone open `http://<this computer's address>:5173/demo/location?friends=50`, drag the map for a few seconds and read the number in the green bar. That page shows 50 made-up friends who move every three seconds. It has no account behind it and does not include the app's frame around the screen.

Not done: the list is not sorted by distance; the dot does not appear by itself while a sharing session runs; the fold of the list is not remembered.

### Phase 1, the rest: six screens held to one standard (plan section 8)

Friends, Groups, Today, Tasks, Notes and Settings were opened on a phone-sized window with data in them, measured by a script and looked at.

| Screen | Found | Done |
|---|---|---|
| Friends | The name of someone asking to be a friend shrank to nothing beside "Chấp nhận" and "Từ chối": the row showed a letter and two buttons | The name keeps a width; the buttons go to the next line |
| Friends | Both ways to add someone are at the foot of the page, under a list that grows | "Thêm bạn" at the top puts the cursor in the username box |
| Friends | No search; "Chưa có kết nối nào." said nothing to do | A search from nine friends on; the empty state names the two ways to add |
| A group | An owner saw three buttons under every member; a class of 13 made a page five screens long | One row a member, the three actions behind "…"; a member search from nine on; members' pictures |
| Tasks | With no task at all the list said "Không có công việc phù hợp bộ lọc." | It says to write the first task in the box above |
| Notes | "Chưa có ghi chú nào." | It says where to write the first one |
| Today, Tasks, Notes, Settings | Controls 20 to 40 px tall: the link in a card's heading, the tabs between sibling screens, the label chips, "Thêm ngày, giờ, mức ưu tiên", the theme and language switches | All 44 px |

Already in place and left as it was: every one of the six screens has one main action in the lime or the dark button; forms clear only after the server has the data, so a failed save keeps what was typed; completing a task or a habit can be undone; deleting a note, a task, a friend or a member asks first; all texts exist in both languages (`e2e/english.spec.ts` reads each screen in English).

Not done: undo for deleting a note or a task (they ask before deleting instead); a search in the list of groups (a person has a handful); the other screens of the app still have chips of 36 and 40 px.

Checked: 3 browser tests, one of which measures every control on the six screens and fails on anything shorter than 44 px or any sideways overflow.

### Found on the way: an action's follow-up was dropped when its screen went away

Leaving a room often left the person at the door of the room they had just left instead of in the list of conversations. `useAction` reloads the data and then runs the caller's follow-up, here "go back to the list". The reload removed the room from the list first, the room's bar left the screen, and the library then dropped the follow-up, because it belonged to a component that was gone. Whether this happened depended on which of two requests answered first, so the test passed alone and failed in the full run.

`useAction` now calls the follow-up itself, also when the asking part of the screen is gone. The browser test answers the two requests 250 ms apart, as a real network does; with that it failed every time on the old code. Every screen that uses `useAction` gets the fix.

### Phase 6: the checks before release

Run on 2026-10-09, 01:40 to 01:50, with Node 22.23.3:

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm test` | 199 tests in 33 files passed |
| `npm run test:db` (embedded Postgres) | 24 files, 430 assertions passed |
| Migrations 0031 to 0037 on the local Supabase database (`migration up --local`, no reset) | All seven applied; it was the first real Postgres they met |
| `npm run test:db:local` (that database) | 24 files, 430 assertions passed |
| Browser tests on the dev server, 3 workers | 71 passed |
| Browser tests on the production build (`E2E_PREVIEW=1`), 3 workers | 71 passed |

After these runs one helper (`birthdayText`) moved from the profile page's file into the profile's domain file: the build had warned that the profile page could no longer load as a part of its own. The type check, the unit tests, a local production build and the dev-server browser run (71) were repeated and passed. The browser run on the production build was not repeated after that move.

The browser run on the production build writes a build wired to the test address into `dist/`. `dist/` was rebuilt with the real settings afterwards. `npm run deploy` builds again before it uploads; `wrangler deploy` on its own would upload whatever `dist/` holds.

Read from the local database after the migrations: seven scheduled jobs (`deliver-due-reminders`, `push-worker`, `purge-stale-presence`, `expire-schedule-sharing`, `purge-closed-rooms` and the two older purges); every table in `public` has row level security; no `security definer` function in `public` or `private` lacks a fixed `search_path`; none of the new functions can be executed by `anon`; the push worker's kick returns quietly when the vault has no address.

The plan's release gate, item by item:

| Gate | State |
|---|---|
| Expense calculation checks | Done: 16 unit tests and 47 database assertions (splits must add up, balances, repayments, a stale edit refused) |
| Unauthorized API access attempts | Done in the database tests of the new tables and functions: a stranger, an ex-friend, a blocked person, the ledger partner, someone removed from a room, a direct call past the app |
| Revoking access removes data from active clients | Done in tests: the database announces the change on the affected user's channel and the open screens reload; a browser test shows the ledger leaving a signed-in screen. Not watched on two real devices |
| Required migrations, worker configuration, scheduled jobs, compatibility | Migrations and jobs: see above. The worker ran once on Deno against a stand-in push service. The cloud side is in the next section |
| Real-device push delivery | Not done. No phone, and the cloud project had no push key |
| GPS and presence on real devices | Not done. No phone |

### What is on the cloud (2026-10-09, 02:00)

Nothing of this entry yet. Read without changing anything:

| Question | Answer | How it was read |
|---|---|---|
| Which project the CLI is linked to | `9try`, the project the app's address in `.env.local` names; the two other projects of the account are not linked | `supabase projects list`, and the linked ref compared with the app's address |
| What a push would apply | Exactly 0031 to 0037, in that order | `supabase db push --linked --dry-run` |
| Edge Functions deployed | None | `supabase functions list` |

The real push (`supabase db push --linked --yes`) was then tried once and refused by the permission check of the tool as a production deploy. Nothing reached the cloud; the site deploy and the functions were not tried after that.

For the owner, in this order, with Node 22 on the PATH:

```bash
npx supabase@2.119.0 db push --linked                # 1. the database: 0031 to 0037
npm run deploy                                       # 2. the web app
npx supabase@2.119.0 functions deploy delete-account calendar-feed process-reminders send-test-push --use-api   # 3. the functions
```

During step 1 one of two notices about the expense ledger is printed; `docs/deployment.md`, section "The expense ledger", says what each means. After the three steps the app is live with everything of this entry except push. Push needs a key pair and two secrets that only the owner should create: `docs/deployment.md`, section "Push notifications". Because the public half of that key is built into the app, step 2 is run once more after it.

What each step changes for people using the live site:

- Step 1 alone, with the site as it is today: "Hoạt động" loads again (0031). Nothing else is visible, since the old build knows none of the new functions. The old build keeps working on the new database; the migrations add and replace, and remove nothing the old build calls.
- Step 2 without step 1: the new screens open and say "Tính năng này chưa dùng được vì máy chủ chưa được cập nhật." Safe, but pointless; do step 1 first.
- Step 3: "Xóa tài khoản" and the calendar feed address start to work on the live site. They fail there today, because no function is deployed.

To check afterwards, read-only: `npx supabase@2.119.0 migration list --linked` shows no pending migration; `npx supabase@2.119.0 functions list` shows four functions; the live site has a "Menu" tab in the bottom bar.

## 2026-10-08, midday: English, and a statistics screen

The owner asked for English in the menu in the corner, and for "Thống kê" in the navigation bar. Local branch `refactor/foundation`, not pushed, not deployed; no database change.

Statistics:

- "Thống kê" is a sixth tab, in the sidebar and in the phone's bottom bar. The bar still fits at 320 px, with each label on one line.
- The screen counts nothing itself. A module adds a card through `stats`: tasks finished day by day, open and overdue; how well each habit was kept, with its streak; the hours with a class, an event or a meetup on them, stacked in the calendar's colors; meetups that took place, are coming or wait for an answer; the conversations with the most messages. The period is the last 7 or 30 days. Chat keeps to 14 days, which is what the server counts.

English:

- Every text of the app now goes through `t("…")`, with the Vietnamese text as the key, and `src/kernel/locales/en.ts` holds the English for all of them, 918 entries. A one-off script rewrote 114 files; sentences with values in them became one text with numbered places, so that English can put the values elsewhere.
- The language is chosen in the account menu and on the sign-in screen, kept on the device, and applied by loading the app again. English is its own file of about 20 kB (gzip); a Vietnamese reader does not download it.
- Dates and numbers follow the language ("Thursday, 8 October", "October 2026", 4.5). The timetable reads "Mon 07:30-09:45 …" as well as "T2 …".
- Notifications in the inbox are written by the database in Vietnamese; the fixed ones are shown in the reader's language.
- Not translated: what people write, the sign-in email, the installed app's name and shortcuts, and the text of a push notification.

Kept whole by tests: `src/i18n.test.ts` fails when a text has no English, when the dictionary holds a text the app no longer says, and when Vietnamese text is in the code outside `t()`. A browser test opens all eighteen screens in English with an empty account and fails on any Vietnamese text.

Found on the way: one browser test failed about once in twelve runs. After "Thôi" the confirmation dialog is in the page for a few more frames, and during those the test's next click landed on the dialog's own button of the same name. Nothing happened in the app, because a closed question ignores an answer; the test now waits for the dialog to be gone. It passed 24 times in a row afterwards.

Checks run with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 134 of 134 in 25 files |
| Browser tests, mocked backend, dev server | 46 of 46 |
| Browser tests against the production build | 46 of 46 |
| Production build | Pass |

The database tests were not run again; nothing under `supabase/` changed since the 189 of 189 of the entry below.

Looked at in screenshots: the statistics screen at 320 px, 390 px and 1280 px, and the calendar, statistics and settings screens in English.

Not verified: the English wording by a native reader (I wrote all of it); screens with real data in English, beyond the calendar and the statistics sample; anything on a real phone or on the live site.

## 2026-10-08, late morning: a calendar that is easy to read, an account menu, and the half-finished parts

The owner said the calendar was not easy on the eyes, asked for a menu in the top right corner for their own account and settings, and asked for the unfinished features to be finished. Local branch `refactor/foundation`, not pushed, not deployed; the cloud database is untouched.

The calendar:

- It was a third-party calendar in a purple theme of its own. In the dark look it stayed white, every entry had the same color, titles were cut short, and the form to change an event opened above the calendar, out of sight on a phone.
- The app now draws it. "Lịch biểu" is the week as a strip with the chosen day's entries listed in full, and is what a phone opens on. "Tháng" is the month, with titles in the cells on a wide screen and the chosen day's list beside it. "Tuần" is the week as an hour grid. A class, an event, a plan with others and a friend's busy time each have a color, in both looks.
- An event opens in a dialog. It can now change the place and who sees the event; the privacy screen sent people to the calendar to make an event private again, and there was no way to do that. Dropping one time of a repeating event and deleting ask first.
- A friend's shared calendar uses the same views. `@fullcalendar/react` is removed: opening the calendar downloads about 7 kB of script instead of about 84 kB (gzip).

The account corner:

- The bell and an account menu are in the top right corner on a phone and on a desktop. The menu shows who is signed in, links to the profile, the privacy screen and the new settings screen, switches the look (light, dark, or the device's setting) and signs out. The sidebar has nine entries.
- Settings gathers the look, push notifications (moved from the inbox), installing the app, the data export, sign-out and account deletion. A module adds a section through `settings`.

Finished on the way:

- Steps that cannot be undone are asked about in the app's own dialog; the 13 browser confirm boxes are gone.
- "Rảnh lúc nào?" ended in a list of times that could not be pressed. A free time now opens a short form and becomes a proposal with that time and those friends in one step.
- "Nhắc việc" never arrived on the live project: only an Edge Function that is not deployed there turned a reminder into a notification. Migration 0030 lets the database do it every minute.
- A task can be added from the task list, not only from Today.
- A refused account deletion says why in Vietnamese. Before, it showed "Edge Function returned a non-2xx status code". Where the function is not deployed, as on the live project, the app says it could not call the server and that the feature may not be turned on; a browser cannot tell that case from a lost connection, because the preflight request of a missing function is answered 404 (asked from outside with a made-up function name).
- The push switch says when a build has no push key, instead of failing when pressed.
- In a "…" menu, only the row under the pointer is highlighted. Before, all rows were.

Checks run with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 120 of 120 in 23 files |
| `npm run test:db` (embedded Postgres) | 30 migrations applied; 189 of 189 assertions in 17 files |
| `npm run test:db:local` (local Supabase Postgres 17, real pgTAP and pg_cron) | 189 of 189 assertions in 17 files |
| Browser tests, mocked backend, dev server | 42 of 42 |
| Browser tests against the production build | 42 of 42 |

Negative control: with the one-day limit in `deliver_due_reminders` loosened, three assertions of the reminder test fail.

Looked at in screenshots: every calendar view at 390 px and 1280 px in both looks, the two event dialogs, the account menu, the settings screen.

Not verified: any of this on a real phone or on the live site; the calendar with a real account's data; pg_cron on the cloud project (migration 0015 tries to enable it; without it 0030 only warns and reminders stay as they were); push, which still needs the worker and its keys.

Left to the owner: `npx supabase@2.119.0 db push --linked` for migration 0030, then `npm run deploy`. Still missing on production and not changed by this work: the Edge Functions `delete-account` and `calendar-feed`, and the worker with its keys for push.

## 2026-10-08, morning: sign-in with Google, and the email's button on the app's own domain

The owner found the sign-in email in Gmail's Spam, then asked for sign-in with a Google account because waiting for an email is harder.

- The email's button now opens the app itself (`<redirect address>?token_hash=…`) instead of a `supabase.co` address, and the app exchanges the token (`src/kernel/auth.tsx`). The hidden preview text and the raw link are gone from the template. While the token is exchanged the screen keeps waiting, so the sign-in form does not flash by. Commit `90cec1e`; the owner deployed it (the live app contains the exchange).
- "Tiếp tục với Google" on the sign-in screen, shown only while the project's public settings say the Google provider is on. A sign-in that comes back with an error shows a fixed message and the error is taken out of the address. An account that came from Google is offered Google's name in the profile form.
- Checks: 107 unit tests, 35 browser tests in dev and preview mode. The Google round trip is tested against a stand-in for the server only.

Read from outside on the cloud project, without signing in: only the `email` provider is on; `https://9try.gnouht.space/<path>` and `http://127.0.0.1:5173/<path>` are accepted as return addresses; the Site URL is `https://9try.gnouht.space/**`, which should be `https://9try.gnouht.space`.

Left to the owner: the Google Cloud client and the provider switch in Supabase (`docs/deployment.md`, "Sign-in with Google"), the Site URL, pasting the new email template into both templates, and one deploy for the Google button.

Later the same morning the owner had done the Google steps and the deploy: the provider is on and the live app has the button. Google's screen said "continue to `<project ref>.supabase.co`" and the owner asked for `gnouht.space` there. The app can now have Google return straight to its own address with an ID token that Supabase checks (`src/kernel/google.ts`, turned on by `VITE_GOOGLE_CLIENT_ID`). 36 browser tests in dev and preview mode. Not tried against the real Google. Left to the owner: add `https://9try.gnouht.space` to the client's redirect URIs, then deploy. The Site URL was still `https://9try.gnouht.space/**`.

## 2026-10-08, about 02:00: the cloud database and the live site are current

The owner ran `supabase db push --linked` and `npm run deploy`. Checked afterwards, read-only:

- `supabase migration list --linked`: 29 applied, none pending.
- The live site serves the new version (new Mode screen, 19 activities, the simpler sign-in text), answers 200 with the security headers, its service worker activates and the shell opens offline, with no console error on the sign-in screen.
- As a visitor who is not signed in, the production API refuses every new function with "permission denied" instead of "not found": friend links, chat, location requests, habit undo, calendar feed, pins, activity modes. `get_shared_busy` refuses too, so the anonymous read of busy times that migration 0015 closes is closed in production. The chat tables return no rows to anyone outside the functions.
- DNS for mail: SPF, the Resend DKIM key, the `send` subdomain and the new DMARC record (`p=none`, reports to `admin@gnouht.space`) are all public.

Not verified: a real sign-in email through Resend (the SMTP fields and templates in the Supabase dashboard cannot be read from outside); anything behind sign-in on production; realtime delivery.

Still missing on production: no Edge Function is deployed (`supabase functions list` is empty), so account deletion, reminders and the calendar feed address do not work there; push keys are not set.

## 2026-10-08, about 01:00: a bolder Mode screen, 19 activities, simpler screens

The owner asked for the features to work on the live app, simpler use, more prominence on the Mode tab for oneself and for everyone, and more activities with icons.

What changed in the code (local branch, 107 unit tests, 181 database assertions on both Postgres, 32 browser tests in dev and in preview mode):

- Mode: the user's card is large, with the activity's icon inside a time ring; without a mode it offers the activities used last for one tap. A strip "Đang hoạt động" shows everyone with a mode on as a face with the activity's ring and icon. Filter chips carry the activity icons.
- 13 more activities (19 in all), grouped in the picker. Migration 0029 moves the list out of the database; a new activity is one line in `modes.ts`.
- A friend who is "Đang rảnh" counts as a reason in the ranking (weight 55).
- Simpler screens: one field to add a task; the inbox lists notifications first; a friend's row has one action and a "…" menu; the calendar has one button and a menu; one line of help on sign-in.

Cloud, not done: the Supabase CLI is logged in and `supabase db push --dry-run` lists migrations 0013 to 0028 as pending on the project `9try` (0029 was written after that run). The push itself was refused by Claude Code's safety classifier as a production change, so it has to be run by the owner:

```bash
npx supabase@2.119.0 db push --linked    # applies 0013–0029 to the cloud project
npm run deploy                           # then publishes this version of the web app
```

Until then the live site at `9try.gnouht.space` is the version of the first deploy, on a database at migration 0012.

## 2026-10-08: first deploy, to 9try.gnouht.space

The owner asked for a deploy to `9try.gnouht.space`, logged wrangler in and added the address to the Supabase redirect URLs. The web app is now served from Cloudflare (`wrangler.jsonc`, static assets with the single-page fallback, custom domain). The deploy created the DNS record for `9try` only; `mcp.gnouht.space` still answers as before. The branch is still not pushed: the upload came from the local working tree at commit `ccfe3b8`.

Before the upload: 32 of 32 browser tests against the production build in preview mode (first preview run since the plan started); the bundle has no server secret and no demo route.

On the live site, read-only: HTTP 200 with the security headers; `/calendar`, `/today`, `/meetups/x`, `/me/privacy` answered with the app; `sw.js` and the manifest served; hashed assets `immutable`; the sign-in screen renders at 390 px with no console error; the service worker activates about 8 seconds after the first load and the shell then opens with the network cut.

Not done and not verified: a real sign-in on the new address; the cloud database is still at migration 0012; Edge Functions are not deployed; push keys are not set.

## 2026-10-07, night: friends ranked on the Mode screen, a shorter menu, tests on a real Postgres

Plan approved by the owner the same day (ranking by upcoming meetups, chat, live activity and pins; trim the Mode screen, the menu, Today, dead code and old documents; use the local Supabase stack for tests). Still the local branch `refactor/foundation`, nothing pushed, the cloud project untouched.

What changed:

- Database tests now also run on the local Supabase stack's Postgres 17 with the real pgTAP: `npm run test:db:local`. Migrations 0014 to 0028 were applied there with `supabase migration up --local`, without a reset. All 17 files pass, 179 assertions. One assertion had been wrong for a real stack: `realtime.send` adds a message id to the payload.
- Migration 0028: `friend_pins` with `set_friend_pin` (accepted friends only, private to the owner, removed on unfriend and block), and `list_conversations` returns `recent_messages`, the messages of the last 14 days.
- Modules report `friendSignals`: chat (unread messages; how much and how lately two people talk), meetups (a confirmed meetup within 48 hours; a proposal waiting for the user's answer), location (a live share). `FriendRanking` weighs them from one table and puts pinned friends first.
- The Mode screen: the user's own mode is one line with six one-tap buttons, and the full picker is a dialog. Below it a "Nổi bật" group of large cards, each with up to two reasons that link to the meetup, the conversation or the map, then everyone else in compact rows. Filters by "Đang bật", "Có hẹn" and by mode. A star pins a friend. Rows glide to their new place when the order changes.
- The menu has 11 entries instead of 16. A navigation entry can name a `parent`; that screen becomes a tab on its parent's screen: Thời khóa biểu under Lịch, Thói quen and Ghi chú under Việc, Rảnh lúc nào? under Hoạt động, Quyền riêng tư under Hồ sơ. Addresses are unchanged.
- Today lost four cards: shortcuts, groups, friends' modes and friends sharing a location. The last two are reasons on the Mode screen now.
- Removed: the unused `motion` package, `src/modules/location/index.ts`, three card files, five superseded plan documents, and the parts of this log that described folders which no longer exist.

On a database without migration 0028 the pin star is hidden and chat volume counts as zero; the ranking uses the signals that are there.

Checks run with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 106 of 106 in 22 files |
| `npm run test:db` (embedded Postgres) | 28 migrations applied; 179 of 179 assertions in 17 files |
| `npm run test:db:local` (local Supabase Postgres 17, real pgTAP) | 179 of 179 assertions in 17 files |
| Browser tests, mocked backend, dev server, reduced motion | 32 of 32 |
| Production build | Pass |

Negative controls: with the meetup weight lowered the ranking tests fail; with the pin cleanup taken out of `revoke_relationship_grants` the pin tests fail on unfriend and on block.

Download size, gzip: sign-in 144 kB, the home screen 213 kB, Today 208 kB.

Not verified: the Realtime service (the local stack runs without it, so events reach `realtime.messages` in tests but no browser has received one); the Edge Functions on Deno; real phones; the cloud project, which is still at migration 0012.

## 2026-10-07, evening: Mode as the home screen, and motion

The owner said the Mode tab has the highest priority, because it shows what each member is doing, and asked for modern effects and animation. Still the local branch `refactor/foundation`, nothing pushed, no Supabase project changed.

What changed:

- Mode is the first tab and the screen at `/`. Today moved to `/today`. This was my reading of "highest priority"; moving Mode back to a tab beside Today is a two-line change in `presence.module.ts` and `today.module.ts`.
- The Mode screen shows the user's own mode with a ring that empties as its time runs out, six mode tiles, duration chips, and every friend grouped by mode with a turning ring in the mode's color. Friends without a mode are listed below. A friend's tile opens the chat with them.
- Today's first card shows the same people. The mode card left the meetups screen.
- Migration 0027 sends a `presence` event to the user and their accepted, unblocked friends when a mode is set, changed or cleared. The event carries no data. Until it is applied, the screen reloads every 20 seconds.
- Motion, all in CSS: screens arrive in steps; one pill slides under the current tab of the bottom bar; bars and cards are frosted over slowly drifting lights; dialogs rise in and leave; buttons lift and give under a press; a shimmer stands in while a screen's code loads; a thin bar shows a fetch that takes longer than 0.4 s; live map markers and mode rings pulse. `prefers-reduced-motion` turns all of it off.
- The shell stays on screen while a page's code loads. Before, the whole screen was replaced by "Đang tải trang…".
- On a phone the profile and the inbox are in the top bar, so the bottom bar keeps five tabs.

Checks run with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 90 of 90 in 20 files |
| `npm run test:db` | 27 migrations applied; 166 of 166 assertions in 16 files |
| Browser tests, mocked backend, dev server, reduced motion | 32 of 32 |
| Production build | Pass |

Download size, gzip: sign-in 144 kB, the home screen 210 kB.

Not verified: how the motion feels and performs on a real phone, in particular the blurred backgrounds on an older Android device; the realtime event on a real Supabase project; everything listed as not verified in the entries below.

## 2026-10-07, later the same day: Today dashboard, task labels and times, meetup pages

Still the local branch `refactor/foundation`, nothing pushed, no Supabase project changed. None of this adds a migration, so it works on a database that stops at migration 0012.

What changed:

- Today is built from cards that the modules contribute (`today` on `FeatureModule`). New cards: friend requests and meetup invitations with the answer buttons on the card, the day's habits, friends' status modes, friends sharing their location, the user's groups, and a hint to install the app. A card with nothing to show stays away. On a wide screen the cards flow in two columns.
- A module can put timed items on the calendar (`agenda`). A meetup with a confirmed time now shows under "Sắp tới" and on the calendar of everyone who has not declined it.
- Tasks take labels typed as hashtags ("Nộp bài #giảitích"), stored in the existing `tags` column, and an optional due time. The full list is grouped into overdue, today, upcoming and undated, and filters by label. A task with a time is overdue from that minute.
- Each meetup has its own page, `/meetups/:id`. The list shows one short row per meetup and no longer loads every poll and discussion. Creating a meetup opens its page. Search, the calendar and Today link to it.
- The inbox has "Đánh dấu đã đọc hết".
- The install hint uses the browser's install offer on Android and desktop, and explains the Safari share menu on iPhone and iPad.
- When a function, table or column of a newer migration is missing, the screen says "Tính năng này chưa dùng được vì máy chủ chưa được cập nhật." instead of the raw database message.

Fixed on the way: in development React's StrictMode unmounts and remounts once, and the session ended its services on that first unmount. Screens then held a dead location controller, so the sharing banner and the privacy screen could stay on "Đang kiểm tra…" until something re-rendered. The session now ends its services a moment after a real unmount. A production build was not affected.

From the earlier "left out" list this closes: task labels, due time and sections (tasks v2 in part), the meetup detail page, inline answers to requests, the install hint. Lists, subtasks and defect 15 are still open.

Checks run with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 90 of 90 in 20 files |
| `npm run test:db` | 26 migrations applied; 161 of 161 assertions in 15 files |
| Browser tests, mocked backend, dev server | 30 of 30 |
| Production build | Pass |

Download size, gzip: sign-in 144 kB, Today 206 kB (172 kB before the plan).

Not verified: the install card on a real Android phone and on an iPhone, and everything listed as not verified in the entry below.

Noticed, not used: a local Supabase stack was answering on ports 54321, 54322 and 55324 during this work. The mocked browser tests used to point at port 54321; they now use a port nothing listens on, so they cannot reach that stack. The database tests were not run against it, because that needs its migrations brought up to 0026 and Docker access was declined earlier.

## 2026-10-07: phases 2 to 10 of the master plan, in a reduced form

Work is on the local branch `refactor/foundation` (`git log main..refactor/foundation` lists the commits). Nothing is pushed, so CI has not run. No Supabase project, DNS record or deployment was changed. Migrations 0013–0026 are not applied to any Supabase project.

Each phase was built in its smallest useful form. The tables say what exists and what was left out, phase by phase.

### What exists

| Phase | Built |
|---|---|
| 2 Shell, sign-in, PWA | Navigation built from the modules: five bottom tabs, a row of sub-screens and a top bar with search and the bell on a phone, a sidebar on a desktop. Dark mode follows the device. Sign-in with the 6-digit code from the email. Update prompt. PNG and Apple icons, manifest shortcuts, safe-area spacing. |
| 3 Friends, groups, realtime, notifications | `friends`, `groups` and `identity` modules. Friend invite links (0018), a blocked list with unblock, a friend picker in place of typed usernames. Group roles, invite list with revoke, a member count kept by a trigger (0019), confirmations on destructive actions. One private realtime channel per user fed by database triggers, and a push for every notification (0017). |
| 4 Chat | Direct and group conversations (0020): history in pages, unread counts and badge, sending that is safe to repeat. |
| 5 Live map | Sharing with chosen friends for a set time, exact or approximate, with a banner and a stop button on every screen. Positions sent every 5 s while moving and every 30 s while still. "Hỏi vị trí" asks a friend to share (0021). Friends' positions are greyed after 60 s without an update. Status modes are a module; their features are unchanged. |
| 6 Calendar | `calendar` module with the repeat engine in its domain. An agenda list on phones. Busy times that follow repeats (0022). `.ics` import that does not duplicate on a second run, and `.ics` export. |
| 7 Timetable, free time, meetups | Classes as weekly events, typed in or pasted, shown by weekday (0022). "Rảnh lúc nào?" finds common free slots and names friends whose busy times are unknown. A meetup in a group invites every member; invitees are picked from friends; each card lists who is invited and their answers (0023). |
| 8 Planner, privacy | `habits` and `notes` modules on their own screens. A habit shows its streak, can be unchecked for the running period (0024) and deleted. Notes and tasks are found without Vietnamese marks. A privacy screen where each module lists what it shares and stops it. |
| 9 Calendar sync | A private feed address for Google or Apple Calendar: migration 0025 and the `calendar-feed` function, which uses the same `.ics` writer as the export. |
| 10 Search, performance | Search over tasks, notes, habits, events, classes, friends, groups, meetups, conversations and screens, opened with Ctrl/Cmd+K or from the phone top bar. The sign-in screen no longer downloads the modules. |

All screens now live in `src/modules`. The folders `src/features`, `src/shared` and `src/bootstrap` are gone, together with `AsyncOwnerScope` and the legacy module.

### What was left out

| Phase | Not built |
|---|---|
| 2 | Design-system gallery and more primitives, a theme switch, the quick-add sheet, the onboarding wizard, an install hint, the app icon badge, the `/plan/*` and `/together/*` route names. Confirmations still use the browser's `window.confirm`. |
| 3 | QR codes, friend lists, nicknames, birthdays, a friend profile page, group pictures, the group hub with tabs, shared task lists, inline actions on notifications. |
| 4 | Meetup threads (meetups keep their comments), replies, reactions, typing indicator, mute, edit and delete, photos. |
| 5 | Avatar markers, smooth movement, "until I turn it off", pause-all, check-in, watch leases. Status v2: catalog, custom status, audience, nudge. |
| 6 | Richer repeat rules, drag and drop, event reminders, colors, source filters, undo of an import. |
| 7 | Semesters and class exceptions, CSV and school-portal import, the availability heatmap, a meetup detail page, the wizard, deadlines, places on a map, arrival sharing. |
| 8 | Tasks v2 (lists, tags, subtasks, due time; defect 15 is open), habit schedules and heatmap, note pinning and tags, the quick-add parser, the focus timer. |
| 9 | Subscribing to an outside calendar address, and the Google account connection. |
| 10 | The offline copy of planner data, list virtualization, an accessibility audit, Lighthouse runs. |
| 11 | All of it: staging acceptance, SMTP, schedulers, monitoring, deployment, the pilot. |

### Defects from the master plan

Fixed and covered by tests: 1–4, 6–14, 16–18, and the anonymous-access part of 5. Migration 0026 closes another part of 5: `is_group_member` and `is_group_admin` no longer answer a caller outside the group. Still open: `prepare_account_deletion` can be called directly by its own user (it prepares only that user's account), and defect 15.

Found and fixed on the way: `.ics` text did not escape semicolons; a monthly event on the 31st skipped short months in other calendars.

### Checks run on 2026-10-07 with Node 22.23.3

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests, also under `TZ=America/Los_Angeles` | 82 of 82 in 19 files |
| `npm run test:db` | 26 migrations applied; 161 of 161 assertions in 15 files |
| Browser tests, mocked backend, dev server | 26 of 26 |
| Production build | Pass, with the known warning for the map chunk |

Download size, gzip:

| Screen | Before the plan | Now |
|---|---:|---:|
| Sign-in | 145 kB | 144 kB |
| Today, first signed-in screen | 172 kB | 202 kB |
| Opening the calendar | + 95 kB | + 94 kB |
| Opening the map | + 284 kB | + 280 kB |

Today is 30 kB over the budget in the plan. The query cache accounts for about 11 kB of that; the rest is the shell and the module services, which load together.

### Not verified

- Anything on a real Supabase stack: the pgTAP files, realtime delivery on the private channels, the push queue. `npm run test:db` uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron, Realtime and pgTAP.
- The `calendar-feed` function on Deno. Its handler was run on Node with the database replaced. It has never been deployed, and no calendar app has fetched it.
- The sign-in email with the code. The cloud project's template has to be changed in the dashboard first.
- GPS, wake lock, push and installation on real phones.
- The preview-mode browser run, and CI.

### What the app does on a database without the new migrations

The local dev server points at the cloud project, which has migrations up to 0012. There the older features work, and these show an error until the migrations are applied: friend links, chat, starting a location share, asking for a location, the timetable, busy times of friends, inviting to a meetup with the friend picker, unchecking a habit, the calendar feed. Realtime events do not arrive, so screens refresh on their timers.

## 2026-10-07: foundation for the master plan (phases 0 and 1)

Work is on the local branch `refactor/foundation`. Nothing is pushed, so CI has not run. No Supabase project, DNS record or deployment was changed.

What changed:

- The previously uncommitted work is committed in seven grouped commits.
- `src/app/modules.ts` lists the app's modules. Signed-in routes and the list of safe return paths come from it.
- `SessionProvider`, keyed by user id, gives each account its own services and query cache.
- Tasks and notifications are modules under `src/modules` with domain, application, infrastructure and presentation layers. Their screens use TanStack Query in place of `AsyncOwnerScope` and lock refs.
- `src/architecture.test.ts` checks the layering rules on every import.
- Migration 0015 ends shares on unfriend and block, limits location sharing and meetup invitations to connected people, purges positions of ended sessions, and removes anonymous access to functions in `public`.
- Migration 0016 lets invite links and reminders find pgcrypto in the `extensions` schema.
- `npm run test:db` applies every migration and runs the pgTAP files on an embedded Postgres.
- The bell in the tab bar and the sidebar shows the number of unread notifications, refreshed every minute.

Checks run on 2026-10-07 with Node 22.23.3:

| Check | Result |
|---|---|
| `tsc -b` | Pass |
| Unit tests | 57 of 57 |
| Production build | Pass |
| Browser tests, mocked backend, dev server | 16 of 16 |
| `npm run test:db` | 16 migrations applied; 63 of 63 assertions in 5 files |

Evidence for the database fixes: without migration 0015 the embedded Postgres let an anonymous caller read a user's busy times, shared location with a stranger, invited a stranger to a meetup, let an ex-friend read busy times, and kept the position of an expired session. With 0015 the same checks pass.

Not verified:

- The pgTAP files on a real Supabase stack. The embedded Postgres uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron and pgTAP.
- Migrations 0013–0016 on the cloud project. None of them is applied there.
- Whether invite links and reminders fail today on the cloud project (defect 18). The failure was reproduced only on the embedded Postgres with pgcrypto in the `extensions` schema.
- The preview-mode browser run, real devices, real email delivery.

Open from Phase 1: generated database types, and moving account-deletion preparation behind the Edge Function.

Earlier entries, written before the code moved into `src/modules`, are in git history.
