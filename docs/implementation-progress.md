# Development-plan implementation status

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
