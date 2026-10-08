# Development-plan implementation status

Newest first. The times of day in the titles of 2026-10-08 follow the commit times (`git log --date=iso`), +07.

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
