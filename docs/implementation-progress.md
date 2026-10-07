# Development-plan implementation status

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

## Subsequent local implementation slices (not release approval)

The UI/UX plan in `docs/ui-ux-development-plan.md` is still in progress. In later local work, the Inbox gained a dedicated owner-scoped, paginated notifications query, safe in-app action links, and account-change guards; the Organizer gained note editing, owner-scoped note mutations, delete confirmation, and retained input on save errors. The meetup screen now scopes list/details to the active owner, distinguishes detail failures from genuinely empty polls, serializes actions, validates proposed end time, labels forms and confirms cancellation. Activity-mode reads and mutations now discard stale owner responses. Existing An/Bình demo users were not renamed and no Vy/Kha cloud accounts were created.

In the following local slice, Home exposes mobile-reachable links to tasks, meetups, friends, location and recent groups. Friends and Groups pages gained owner lifecycle guards, serialized actions, input retention, error/loading states and destructive-action confirmations; Organizer routine/reminder actions gained pending/error handling, and routine completion display now uses the profile timezone to match the server. Weekly routine semantics remain undecided; the UI explicitly describes today's recorded completion, not a completed weekly period.

The owner chose **one completion per Monday–Sunday week in the profile timezone**, with acceptance on **disposable staging**. `supabase/migrations/0014_weekly_routine_period.sql` implements the server-side weekly limit under a task row lock; the client now calculates weekly versus daily completion from profile-local dates. Its new pgTAP test is `supabase/tests/database/weekly_routine.test.sql`. Migration 0014 has **not** been applied anywhere in this slice: local Docker API access returned `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`, so the SQL test has **not run**. Do not release weekly routine behavior until migration 0014 is verified on disposable Postgres and applied in staging before testing the new client. The owner confirmed disposable staging is **not yet available** and Docker access will **not** be enabled now. Staging credentials and controlled real-email accounts remain owner-gated.

Most recent local validation: typecheck; 50 unit tests; production build; 15 mocked Chromium E2E tests in both dev and preview; `git diff --check` — passed. The lazy map chunk still exceeds Vite's 500 kB warning threshold. These browser tests are mocked, not proof of SMTP delivery, real-device GPS, cloud permissions, or production readiness. No cloud settings, accounts, existing database migrations, DNS or deployment changed in these slices. Earlier numeric test counts below are historical snapshots.

This is an evidence-based progress report against `docs/system-development-plan.md`, **not** a production-readiness sign-off. Existing uncommitted source changes were preserved; no cloud settings, DNS, production accounts or deployments were changed.

## Completed in this iteration

| Plan ticket | Implemented | Evidence |
|---|---|---|
| GT-001 | Captured a local baseline patch and re-ran the previous 36 tests/typecheck | `/tmp/gnouht-plan-implementation-baseline.patch`; baseline terminal validation |
| GT-003 | Magic-link page now serializes submissions, catches network/quota failures, distinguishes accepted request from delivered email, keeps the address editable, adds a cooldown and safe same-origin invite redirect | `src/features/auth/`, `e2e/ui.spec.ts`; **not proof of actual Gmail delivery** |
| GT-004 | Browser reproduction confirmed original MapLibre worker URL requested `/node_modules/.vite/deps/maplibre-gl-worker.mjs` with HTTP 404. Added a Vite-bundled same-origin worker. | `src/features/location-sharing/infrastructure/maplibre.ts`; afterward observed worker HTTP 200, basemap + two markers and no page errors in Chromium dev; preview tests also pass |
| GT-005 | Extracted reusable `MapCanvas`, added load/renderer/resource error, timeout and retry states, resize handling, focus person/show all, map-first layout and separate location-data errors | `MapCanvas.tsx`, `LocationSharingPage.tsx`, forced-error E2E |
| GT-006 | Recipient polling now uses owner lifecycle/epoch, clears prior owner markers and rejects late owner responses | `LocationSharingPage.tsx`; source guards; add focused delayed-request browser test before release |
| GT-007 | Two fictional profiles/markers available through `/demo/location` in dev or explicitly opted-in builds, without Auth/GPS/Supabase. A separate local-only integration script creates and destroys two disposable real Auth identities for privacy tests. | `src/features/demo/`, `scripts/local-two-user-check.mjs`; confirmed without cloud accounts |
| GT-008 | Isolated Chromium browser contexts test fictional viewers; **additional local-only script** now injects two real independently authenticated sessions and tests owner task visibility, recipient marker, reload without GPS and stop/revocation. | `e2e/ui.spec.ts`, `scripts/local-two-user-check.mjs`; not yet a full staging or Gmail journey |
| GT-009 | Shared semantic color tokens, focus/touch improvements, accessible Radix-based dialog with focus return and keyboard escape; responsive snapshots across 320/390/768/1280 px | `src/styles.css`, `src/shared/ui/DialogPanel.tsx`, Playwright tests |
| GT-010 | Calendar creation moved into a compact accessible dialog with default-private settings, click-to-prefill, lazily opened `.ics` import; large routes lazy-load | `CalendarPage.tsx`, `AuthenticatedApp.tsx`, `App.tsx` |

**Dependency provenance:** `@radix-ui/react-dialog@1.1.23` (MIT) and `@playwright/test@1.63.0` (Apache-2.0). Versions pinned in lockfile; package scripts were inspected before installing with `--ignore-scripts`. Radix is a dependency, not vendored reference source. Preserve bundled dependency notices in distribution.

## Validation performed

- `npm run typecheck` — passed after map/login changes; re-run final gate after all subsequent edits.
- `npm test` — 41 unit/domain tests passed after map/login changes; re-run final gate.
- `npm run build` — passed; emitted same-origin worker. MapLibre route asset is large (~1.05 MB before gzip), but it is route-lazy; warning remains.
- `npm run test:e2e` — 10 Chromium browser tests passed with mocked Auth/API/map style. `npm run test:e2e:preview` — same 10 passed in built preview; tests do not contact the configured cloud project.
- A **separate manual Chromium dev run** loaded the actual OpenFreeMap basemap with the worker at HTTP 200 and two fictitious markers. Browser visual snapshot: `/tmp/gnouht-map-after.png`. This does not establish every device/network can load tiles.
- `scripts/local-two-user-check.mjs` — passed after two source/database issues were fixed: two disposable Auth identities with distinct Chromium contexts, API owner/anon/other-user checks, Home completion/Undo, marker visibility, reload without GPS, stop and physical position row deletion. No real Gmail, physical GPS or production/staging touched.
- `npx supabase@2.119.0 test db supabase/tests/database` — 29 pgTAP assertions passed locally across activity modes and the new location policy regression. Migration `0013_location_policy_recursion.sql` was applied **only to local Supabase** after a dry run confirmed it was the sole pending migration.
- **Previously hidden defects corrected:** `location_sessions` ↔ `location_recipients` SELECT-policy recursion blocked owner position UPSERT; a narrow SECURITY DEFINER recipient predicate breaks the cycle. One-time tasks use schema value `recurrence = 'none'`, not `IS NULL`; Home/list/edit/delete/Undo now use the actual value. These source/migration changes are not applied to the cloud project.
- CI browser job added; **not yet verified on GitHub Actions**.

## Still open / owner-gated

1. **Gmail:** Auth API acceptance is not delivery. Owner must approve access to Auth/SMTP/provider delivery logs and SMTP/domain setup; do not insert keys in frontend. Check fresh and existing real addresses, bounce/suppression and callback. No claim of Gmail delivery.
2. **Full staging E2E:** local real authenticated browser contexts are now exercised, but stranger/blocked-user, account switch, social invitation and real email-link journeys are not. An/ Bình demo remains fiction; local credentials are disposable and never reused on cloud.
3. **Accessibility:** screen readers, keyboard/focus across remaining screens, color-contrast audit, physical 320px and iOS safe-area tests. A browser viewport test is not device validation.
4. **Calendar/tasks:** profile timezone and weekly-routine semantics need owner decision. ICS UID dedupe/batch/recovery and task pagination remain incomplete.
5. **Social/inbox:** friend/group journeys, original Rallly-inspired poll improvements, actionable notifications and more complete E2E remain future phases.
6. **Map:** real 2-device GPS permissions/accuracy/background/stale/revoke tests, tile errors under production CSP, recipient-picker replacement and broader negative RLS cases remain. A local owner/recipient/stranger policy test does not prove cloud permissions; cloud migration 0013 remains pending review/approval. Do not claim reliable background tracking.
7. **Operations:** SMTP/push setup, full SQL privacy suite, CI green status, backup/restore rehearsal, performance budgets, staging and production rollout/rollback remain pending. Do not alter `mcp.gnouht.space`.

## Safe local commands

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run test:e2e
npm run test:e2e:preview
npm run dev
# Browse http://127.0.0.1:5173/demo/location (dev-only, no login or GPS)
```

To run the real **local-only** two-user browser and RLS smoke test (after applying local migrations), use `scripts/local-two-user-check.mjs` with `LOCAL_SUPABASE_URL=http://127.0.0.1:54321`, `LOCAL_SUPABASE_PUBLISHABLE_KEY`, `LOCAL_SUPABASE_SERVICE_ROLE_KEY`, and `CONFIRM_LOCAL_TWO_USER_TEST=yes` supplied as process environment variables from a local Supabase instance. Never paste those values in chat/logs or run against cloud. The script refuses non-loopback hosts, generates `.test` addresses and random passwords, and deletes only identities it created in its `finally` block.
