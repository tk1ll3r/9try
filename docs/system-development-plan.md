# Gnouht Together — Detailed System Development and UI/UX Plan

**Status:** Proposed execution plan; not a claim that the features below are implemented or production-ready.  
**Research snapshot:** 2026-10-05 UTC.  
**Product:** Vietnamese-first private planning and coordination for trusted friends and families.  
**Scope:** Improve the existing application, resolve email/map blockers, provide two-user testing, and incrementally complete the core journeys.  
**Planning boundary:** This document does not authorize cloud account creation, production data changes, deployment, DNS changes, or copying third-party code.

## 1. Executive recommendation

Keep the current React + Supabase architecture. Do not replace the application with a generic dashboard template or migrate to Next.js merely because a reference project uses it.

Develop in this order:

1. Make access and the map reliable: diagnose actual email delivery, verify MapLibre worker loading, and distinguish a broken basemap from missing shared locations.
2. Establish a safe, reproducible two-user environment and browser test harness.
3. Introduce a small accessible design system, then improve the existing screens rather than adding more top-level destinations.
4. Complete daily planning and social coordination journeys: tasks, calendar, invitations, availability polls, notifications, and explicit sharing controls.
5. Optimize loading, harden authorization and operations, and release only after multi-user/device acceptance.

**Product principle:** Show the next useful action, not every available setting. Advanced functionality should remain available through progressive disclosure.

## 2. Current system: evidence and gaps

### 2.1 Existing implementation

The source tree contains:

- React 19, TypeScript 7, Vite 8, Tailwind 4, React Router, Lucide icons, and Motion.
- Supabase Auth, Postgres/RLS, RPCs, and Edge Functions.
- Friends, groups, group invitations, meetups, activity modes, calendar recurrence/exceptions, personal tasks/notes/routines, notifications, and time-limited location sharing.
- FullCalendar, Temporal, ICAL parsing, MapLibre GL JS 6.11.2, and a PWA static-shell cache.
- A previous usability sprint covering occurrence-based Home events, one-off task management, owner lifecycle guards, and recovery/stopping of active location sessions.

Source anchors:

| Area | Main files | Planning implication |
|---|---|---|
| Application routes/navigation | `src/App.tsx`, `src/shared/ui/AppShell.tsx` | Preserve routes initially; prototype new grouping before changing navigation |
| Visual foundation | `src/styles.css`, `src/shared/ui/Button.tsx`, `Card.tsx` | Existing warm neutral/lime identity can be expanded rather than discarded |
| Authentication | `src/features/auth/presentation/AuthPage.tsx`, `src/bootstrap/AuthProvider.tsx` | Submission success currently appears as “link sent”; delivery is not verified |
| Home/task access | `src/features/home/presentation/HomePage.tsx`, `src/shared/infrastructure/AppData.ts` | Improved recently; still needs browser-level acceptance and less query coupling |
| Calendar | `src/features/calendars/infrastructure/CalendarData.ts`, `presentation/CalendarPage.tsx` | Retain recurrence engine; test boundaries and simplify presentation |
| Tasks/organizer | `src/features/personal/presentation/TaskListCard.tsx`, `OrganizerPage.tsx` | Complete one-off tasks separately from unresolved routine semantics |
| Map/sharing | `src/features/location-sharing/presentation/LocationSharingPage.tsx`, `domain/LocationController.ts` | Session lifecycle improvements do not prove basemap rendering works |
| Authorization | `supabase/migrations/`, `docs/permission-matrix.md` | UI visibility is not an authorization boundary |
| Existing acceptance record | `docs/sprint-usability.md` | Retain previous work and regression coverage |

### 2.2 Verified, reported, and unknown

**Verified through source/configuration inspection during this work:**

- The working tree contains uncommitted changes. Preserve them and review the actual diff before splitting implementation commits.
- The inspected `.env.local` points to Supabase cloud. Public Auth settings enable email authentication and require confirmation. No secret values were included in this document.
- The map source imports MapLibre CSS and gives the container a height, but no `setWorkerUrl` configuration was found in application source or Vite configuration.
- Installed MapLibre 6 resolves its default worker relative to its module URL. The official OpenFreeMap Vite example explicitly configures a bundled worker.
- A direct style request initially failed; a subsequent browser-User-Agent request returned HTTP 200 with `Access-Control-Allow-Origin: *`. This is not proof that the user's browser can fetch every tile, glyph, sprite, or worker.

**User-reported blockers:**

- The login UI says the link was sent, but it is not appearing in Gmail.
- The map is not visible.

**Previous local validation, not rerun as part of this planning-only task:**

- Typecheck, production build, and 36 tests passed, including runs with Los Angeles and Ho Chi Minh City timezones.
- The bounded usability sprint received a source-level reviewer pass after two defects were fixed.
- Build output still had a large initial JS bundle: approximately 2 MB before gzip / 572 KB gzip.

**Not established:** Gmail delivery root cause, browser map root cause, comprehensive SQL/RLS coverage, multi-user E2E success, physical-device GPS/push behavior, current deployment state, or restore readiness. Do not describe these as solved.

## 3. Reference repositories and adoption decisions

Repository research covers primary READMEs, selected license files, and GitHub metadata—not a complete security audit or hands-on evaluation of every product. Pin the exact release/commit and recheck its license before reuse.

| Repository | Relevant pattern | Proposed use | License/maintenance caveat |
|---|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Composable, customizable application components | Adopt selected source components for dialogs, menus, tabs, input states, and confirmations; restyle with existing tokens | MIT; retain notices. Do not import an entire starter or assume all registry entries share the same license |
| [Radix Primitives](https://github.com/radix-ui/primitives) | Accessible unstyled interaction primitives | Use a single consistent primitive family underneath shared components; focus management, keyboard navigation, dialog semantics | MIT; accessibility primitives still require correct labels, content and integration tests |
| [Rallly](https://github.com/lukevella/rallly) | Time-option polls, availability grid, comments, finalize-a-date flow | Study interaction structure for meetups; implement original UI against existing Supabase domain rules | AGPL-3.0-or-later per README; no source/assets copied without explicit licensing review. Do not copy anonymous voting into private groups by default |
| [Cal.diy](https://github.com/calcom/cal.diy) | Availability and booking flow organization | Secondary product reference for date/time selection, timezone clarity and confirmation states | During research, `calcom/cal.com` redirected here. Current README/license say MIT but explicitly warn about personal/non-production use. Do not treat it as a production backend recommendation |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | Basemap lifecycle, controls, markers and bounds | Keep installed MapLibre; use official Vite worker integration and examples to repair the existing map | BSD-3-Clause-style main license with bundled notices; tile/style/data attribution and service policies are separate |
| [react-map-gl](https://github.com/visgl/react-map-gl) | React-oriented map lifecycle API | Evaluate only if a small spike demonstrates less lifecycle complexity after the current renderer is fixed | Main license MIT with additional bundled notices. Confirm compatibility with installed React/MapLibre versions before adding |
| [TanStack Query](https://github.com/TanStack/query) | Server-state loading, caching, invalidation, pagination | Pilot on tasks/notifications after correctness work; introduce owner-keyed queries and explicit logout cleanup | MIT. Do not persist private data or GPS offline by default; it does not replace RLS or lifecycle correctness |
| [Playwright](https://github.com/microsoft/playwright) | Isolated browser sessions, cross-browser E2E and traces | Add two-context authenticated tests, route smoke tests, screenshots and accessibility integration | Apache-2.0. Browser emulation does not prove native mobile/background behavior |
| [OpenFreeMap examples](https://github.com/w3cj/openfreemap-examples) | Small integration examples | Compare basic setup and expected visual result, then follow current official MapLibre/OpenFreeMap docs | MIT; metadata indicated older activity, so examples are not authoritative for MapLibre 6 worker setup |
| [Novel](https://github.com/steven-tey/novel) | Rich-text note editing | Defer; inspect only if user research justifies rich notes | Apache-2.0; last push metadata observed in January 2025. No AI editor dependencies or collaboration backend in this scope |
| [Vaul](https://github.com/emilkowalski/vaul) | Mobile drawer interactions | Interaction inspiration only; prefer a supported dialog/sheet implementation for new dependencies | MIT, but current README explicitly says unmaintained. Avoid adopting it automatically through a template |

### Adoption rules

1. **Reference, not clone:** reproduce useful interaction principles, not branding, proprietary assets, or whole architectures.
2. **Dependency budget:** initially add only the selected accessible UI primitives and test tooling. TanStack Query and a map wrapper require separate justified spikes.
3. **Compatibility gate:** install selected pinned versions on a branch; validate React 19, Tailwind 4, Vite 8, TypeScript 7, build, SSR-independent SPA routing, and existing tests.
4. **License inventory:** record source repository, commit/release, copied files, modifications, license text and required notices in a future `THIRD_PARTY_NOTICES.md`.
5. **No risky install shortcuts:** inspect package scripts; no remote shell pipelines, bulk template execution, or migrations copied from reference products.

## 4. Product structure and interaction model

### 4.1 Primary user journeys

| Journey | Desired outcome | UX success criterion |
|---|---|---|
| First login | User understands where the link goes and recovers when it does not arrive | No false delivery guarantee; clear retry/help and editable email |
| Plan today | See upcoming events and add/complete a task | Quick add in at most three interactions after Home loads; completed task can be undone |
| Arrange a meetup | Invite trusted people, propose times, vote, finalize | Participants can identify the winning slot and RSVP without navigating unrelated settings |
| Share location | Choose recipients and expiry, understand visibility, stop reliably | Recipient and expiry remain visible; stop works after reload and has a recoverable error state |
| Review activity | Open actionable invitation/change/reminder | Notification opens the relevant authorized destination, not merely marks itself read |
| Manage privacy | Inspect audiences and revoke sharing | No hidden default-public state; revocation behavior is documented and tested |

### 4.2 Information architecture

**Near-term:** preserve the existing five navigation destinations and deep links. Add clear shortcuts to tasks, meetups, friends and location; improve labels before moving everything.

**Prototype for evaluation, not an immediate migration:**

```text
Today         Plans            Connections        Inbox           Me
overview      Calendar         Friends            Invitations     Profile
quick add     Tasks            Groups             Changes         Preferences
activity      Routines         Meetups            Reminders       Privacy
                               Shared location                    Data/account
```

Test the prototype against the current navigation with 3–5 representative users. Choose a grouping only if task discovery and completion improve. If adopted, retain old route redirects and test saved links/PWA navigation. Do not add a sixth mobile tab for the map.

### 4.3 Visual and component system

Keep the current warm-paper, dark-ink and lime visual identity. Refine it with:

- Semantic tokens: background, surface, border, text, muted text, accent, success, warning, danger, focus, overlay.
- A consistent 4/8-pixel spacing rhythm; limited radius and shadow scales; readable body text rather than tiny metadata everywhere.
- Clear primary/secondary/tertiary actions, destructive confirmations and inline validation.
- Shared `PageHeader`, `EmptyState`, `ErrorState`, `LoadingState`, `Field`, `Dialog/Sheet`, `ConfirmAction`, `StatusBadge`, `PersonPicker`, and `AsyncButton` patterns.
- Mobile-safe-area padding, visible focus rings, touch targets of at least 44×44 CSS pixels, reduced-motion support and semantic headings.
- WCAG 2.2 AA-oriented contrast and keyboard testing; dark mode receives its own contrast review.
- One Vietnamese terminology glossary. This plan is English; product copy remains Vietnamese-first.

**Component acceptance:** loading/empty/error/success states are demonstrated, focus returns after dismissal, labels are programmatic, no keyboard trap, and content works at 320/390/768/1280 px without horizontal page overflow.

## 5. P0: email authentication and delivery

### Diagnosis sequence

1. Reproduce once using an owner-approved test address. Record time, environment and sanitized Auth error/request ID; do not log email link tokens.
2. Confirm the browser is using the intended Supabase project, not stale dev-server/build configuration.
3. Inspect Supabase Auth logs and SMTP configuration using authorized dashboard access. Determine whether the request was accepted, restricted, rate-limited, failed at SMTP, or handed to the mail provider.
4. If a custom SMTP provider exists, inspect provider delivery/bounce/suppression events. Provider acceptance still does not guarantee Gmail inbox placement.
5. Check Spam/All Mail, sender authentication, SPF/DKIM/DMARC and sender-domain verification.
6. Verify Site URL and allowed callback URLs separately; wrong redirects typically affect opening the link, not whether a message arrives.

Supabase's current documentation says the default mail service is limited to team-authorized recipients and approximately two emails per hour. This is a **possible configuration issue**, not a confirmed diagnosis of this project.

### Application improvements

- Normalize whitespace, show pending state, serialize submits, catch thrown/network errors and translate actionable failures.
- Replace unconditional “delivered” wording with “Request accepted—check your inbox.” Explain Spam, delays and support/retry steps.
- Keep email editable after submission; provide a resend action with a visible cooldown consistent with server limits. Never hammer the endpoint automatically.
- Preserve an allowlisted same-origin invitation destination across login without introducing open redirects.
- Distinguish local Mailpit instructions from cloud delivery guidance.
- Optional future Google sign-in requires an explicit product/configuration decision; do not silently replace magic links.

### Exit criteria

- A fresh test account and a returning account can request and use a link.
- Controlled real-email testing demonstrates receipt, callback and session establishment; local Mailpit-only tests are labelled separately.
- Expired links, throttling, wrong address, network failure and disallowed callback states have actionable UI.
- No SMTP password/service-role key enters frontend code or logs.

**External dependency:** owner-approved SMTP/dashboard access and any sender-domain changes. Do not modify `mcp.gnouht.space` DNS, tunnel or Access configuration.

## 6. P0: restore and redesign the map experience

### 6.1 Separate the failure layers

| Layer | Evidence to collect | Expected behavior |
|---|---|---|
| Layout | Container bounds after mount/orientation change | Non-zero dimensions; `resize()` when the layout changes |
| Renderer | WebGL support, construction exception, context loss | Map or explicit fallback—not a silent blank card |
| Worker | URL, response status/MIME, console errors, CSP | Bundled module worker loads in Vite dev and production preview |
| Basemap assets | Style, TileJSON, vector tiles, sprites, glyphs and CORS | Geographic features/labels appear independently of user locations |
| Location data | Authorized query, loading/error/empty states | A working basemap with zero recipients is a valid empty state |
| GPS | Permission, secure context, accuracy, expiry | Precise guidance; no claim of reliable background tracking |
| Auth lifecycle | Account switch, logout, delayed recipient requests | Old-owner data/markers never overwrite the new session |

### 6.2 First technical hypothesis

The strongest source-based hypothesis is missing **MapLibre 6 worker configuration for Vite**. Test the official setup before replacing the provider or library:

```ts
// Candidate implementation for a dedicated map setup module; not yet applied.
import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
setWorkerUrl(workerUrl);
```

Confirm emitted worker assets, MIME type, CSP and base-path behavior in both development and the built application. A style URL returning HTTP 200 does not validate these layers. Do not claim this is the root cause until browser reproduction and a before/after test confirm it.

### 6.3 Implementation tasks

- Extract `MapCanvas`/map initialization from location permission and session controls.
- Catch construction errors and keep error boundaries local to the map.
- Separate `mapLoadError`, recipient-query errors and GPS/session errors; one successful event must not clear unrelated errors.
- Add an explicit loading/retry/fallback state. Retry must dispose the prior map, listeners and markers correctly.
- Scope recipient polling and stale results to the authenticated owner, as session recovery already does; clear markers/camera state on account change.
- Keep pan/zoom stable during polling; use explicit “Locate me”, “Focus person” and “Show all” controls with bounds handling for zero/one/many points.
- Show timestamps, approximate status, expiry and uncertainty. Do not imply that rounding guarantees a fixed accuracy radius.
- Replace comma-separated usernames with an accessible recipient picker after permission policy is settled.
- Make mobile layout map-first with a collapsible people/share panel; preserve an always-discoverable stop control.
- Keep attribution visible. If tiles fail, retain the authorized people/session list and stop controls.

### Exit criteria

- A real browser shows the basemap in Vite dev and production preview.
- The worker and relevant map resources return usable responses; no uncaught map error occurs.
- Both seeded people appear in fixture mode; separately, real authenticated contexts show only authorized live records.
- Test WebGL failure, denied GPS, tile failure, empty recipients, stale data, multiple active sessions, stop failure/retry, expiry and account switching.
- Two physical devices verify foreground GPS and revocation behavior before release. Do not count mocked browser coordinates as this evidence.

## 7. Two-user demo and test strategy

Interpret “add two users for testing” as a development/staging requirement—not permission to insert fake people or live coordinates into production.

### 7.1 Two distinct modes

**A. UI fixture/demo mode**

- Two fictional profiles: **An** and **Bình**. Use reserved addresses such as `an@example.test` and `binh@example.test`; these are not Gmail delivery-test recipients.
- Clearly labelled “Demo data — simulated locations”; fixed public-place coordinates, not a person's home or real tracked route.
- Available only through an explicit development/test entry point; never mixed into authenticated production queries or notifications.
- Useful for screenshots, responsive states and map markers; provides no authentication/RLS evidence.

**B. Authenticated integration mode**

- Two real Auth identities in disposable local Supabase or an explicitly approved staging project.
- Create identities through supported Auth APIs in a server-only setup script. Seed application rows against the returned user IDs; do not insert fake users directly into `auth.users` from the browser.
- Script requires explicit environment selection and rejects production/unknown hosts. Use per-run identifiers and scoped cleanup, not broad database deletion/reset.
- Admin/service credentials exist only in a local process or CI secret store; no committed test passwords or keys.
- Local login uses Mailpit. Real Gmail delivery is a separate manual/staging test using owner-provided controlled addresses.

### 7.2 Fixture data

| Resource | An | Bình |
|---|---|---|
| Profile | `demo_an`, Ho Chi Minh City timezone | `demo_binh`, same default timezone; separate timezone test later |
| Friendship | Accepted friendship with Bình | Accepted friendship with An |
| Group | Owner of “Weekend Plan” | Member |
| Meetup | Proposes three candidate slots | Votes and RSVPs |
| Calendar | Private event, explicitly shared free/busy window, one recurring exception | Separate private event; must not see An's private title |
| Tasks | Overdue, today, future, undated and completed tasks | Different private tasks |
| Activity | One active mode with expiry | One different mode |
| Location | Explicitly shares one expiring session to Bình | Receives it; second case reverses direction |
| Notifications | Invitation/change/reminder samples | Vote/RSVP samples |

### 7.3 Two-context E2E scenarios

1. Log An and Bình into isolated browser contexts with separate storage state.
2. Verify private task/note/calendar separation through UI **and direct authenticated API requests**.
3. Create/join group, vote, finalize meetup, RSVP, and follow notification links.
4. Share location An → Bình; verify visibility, then stop and verify position deletion/access denial server-side.
5. Reload An's page; recover active sessions without automatically acquiring GPS.
6. Revoke sharing, remove friendship, block, expire sessions and switch accounts; verify explicit policy.
7. Set one authenticated user to a non-recipient state for negative tests. Add disposable stranger/anonymous contexts where two mutually authorized users cannot cover the full privacy matrix.
8. Test 320/390/768/1280 px layouts and keyboard workflows; collect failure traces without credentials or raw location history.

**Exit:** setup and cleanup are repeatable, tests leave no production data, and authorization assertions do not rely solely on hidden UI elements.

## 8. Screen-by-screen development backlog

| Area | UI/UX changes | Functional/data work | Acceptance |
|---|---|---|---|
| Today | Compact agenda, task quick-add, pending invitations, optional activity shortcut | Uncouple unrelated queries; owner-scoped loading/error states; do not truncate silently | Add task ≤3 interactions; each card fails/retries independently; dates match Calendar |
| Calendar | Agenda-first mobile view; compact create dialog; advanced recurrence/share/import disclosure | Recurrence/exception/DST tests; audience preview; ICS deduplication and batch outcomes | Timed/all-day/moved occurrences agree; repeat import does not silently duplicate |
| Tasks | Group overdue/today/upcoming/no-date; search/filter; clear completion/Undo | Pagination, edit conflicts, recoverable errors; routine semantics remain separate | Future tasks discoverable; unchanged due timestamp preserved; owner-switch safe |
| Routines | Clear current-period progress, not misleading “today” labels for weekly tasks | Decide week start, profile timezone, once-per-week vs scheduled-day semantics before changing SQL | UI and RPC compute the same period; boundary/DST tests pass |
| Friends | Search/select profiles, clear request states, explain block effects | Rate limits, unfriend/block revocation contract | Pending/accepted/declined/blocked paths work across two accounts |
| Groups | Member overview, role badges, invite expiry and join preview | Ownership transfer and membership permissions | Last owner cannot disappear; expired/reused invite has clear feedback |
| Meetups | Rallly-inspired original poll layout, vote summary, finalize CTA, mobile alternatives to wide tables | Preserve transactionally enforced capacity and allowed transitions | Two users complete poll → confirmation → RSVP; concurrent capacity test passes |
| Activity modes | Small one-tap card with expiry and audience disclosure | Enforce expiry/block rules server-side; explicit refresh/subscription lifecycle | No inferred activity from GPS; expired mode disappears; no push spam on every change |
| Location | Map-first layout, people list, recipient picker, active-session banner, stop action | Worker/resource repair, lifecycle/query guards, server authorization tests | Basemap works separately from GPS; stop/revoke verified end-to-end |
| Inbox | Unread grouping, useful timestamps, action buttons, relevant destination | Dedicated query/pagination; permission check on navigation | User reaches correct object; revoked/deleted objects show safe fallback |
| Notes | Readable list, edit flow, delete confirmation, empty states | Plain-text reliability first; defer rich editor | Save/edit failures preserve input; private notes remain isolated |
| Profile/privacy | Timezone, preferences, active shares, export/delete separated by risk | Server-enforced export/delete flows; confirmation and recovery guidance | Sensitive actions cannot be triggered accidentally or by another user |

## 9. Architecture and data evolution

### Keep

- React SPA, existing route structure during early phases, Supabase RLS/RPC boundaries, Temporal and current calendar engine.
- Domain tests and scoped owner lifecycle protections added in the previous sprint.
- Static-shell-only service worker caching. Never cache private API responses or raw GPS history through Workbox.

### Refactor incrementally

- Reduce `AppData` cross-feature responsibilities by extracting typed feature repositories behind compatible interfaces. Do not perform a big-bang rewrite.
- Separate presentation models from raw database records; improve error normalization without exposing sensitive SQL details.
- Introduce owner-keyed query conventions such as `['tasks', userId, filters]`; explicitly cancel and clear private caches on logout/account change.
- If adopting TanStack Query, migrate one vertical slice and test stale mutation/owner behavior before expanding. Do not run competing bespoke and query-cache ownership for the same slice indefinitely.
- Add bounded pagination and visible truncation/load-more behavior. Replace the calendar's 500-master/2,000-step limitations only through a separately tested range-query/expansion design.
- Use lazy routes for calendar, map and ICS; load heavy libraries only when needed.

### Schema changes must be justified

Potential later changes—not automatic additions:

- ICS source UID/import-batch identity under owner scope, with explicit dedupe/update semantics.
- Weekly routine completion-period model after the product decision.
- Structured notification targets if existing payloads cannot support safe navigation.
- Server-side location update limits/validation and recipient revocation semantics if current RPC/RLS tests reveal gaps.

Every change needs a versioned migration, authorization tests, data compatibility strategy, staging validation and rollback/forward-fix notes. No ad hoc production SQL as a substitute for migrations.

## 10. Delivery phases and estimates

Estimates are **engineering working days for one primary implementer**, not commitments. Assume existing dependencies work and owner-controlled access is available. Work is primarily serial; reviews/testing are included but SMTP/domain approvals can add calendar delay.

| Phase | Estimate | Work packages | Dependencies | Exit gate |
|---|---:|---|---|---|
| 0 — Reproducible baseline | 1–2 days | Preserve dirty changes; capture current screenshots, errors, test/build output; define test environments | None | Repro steps and baseline evidence recorded; no user edits lost |
| 1 — Restore access and map | 3–5 days | Email diagnosis/UX; worker/rendering spike; map error separation and fallback | Phase 0; SMTP access for delivery branch | Auth and map acceptance pass; external blocker clearly recorded if approval missing |
| 2 — Two-user harness | 2–4 days | Fixture mode, isolated Auth seed/cleanup, two browser contexts, initial RLS/E2E cases | Phase 0; Phase 1 for full browser journey | Repeatable demo plus distinct authenticated tests; no prod contamination |
| 3 — UI foundation | 3–5 days | Tokens, accessible primitives, shared states, responsive shell, IA prototype testing | Phase 1; Phase 2 fixture data | Core components and proposed navigation validated before broad rollout |
| 4 — Daily planning polish | 4–6 days | Home/cards, task pagination, calendar forms, ICS acceptance; routine decision/implementation if approved | Phase 3; timezone/weekly decisions | Daily journey works on mobile; no private data or time-boundary regression |
| 5 — Social and location journeys | 4–6 days | Friends/groups, poll/finalize, recipient picker, Inbox actions, permission tests | Phases 2–3; sharing policy | End-to-end two-user coordination and revocation pass |
| 6 — Performance and pilot release | 3–5 days | Lazy loading, a11y, device testing, SMTP/push readiness, CI, restore drill, rollback | Phases 4–5 | Release checklist signed off, no unresolved critical/high defects |

**Total:** approximately 20–33 engineering days, typically 4–7 working weeks before external delays. Do not promise this schedule until the map and email investigations bound their unknowns.

### First ten implementation tickets

| ID | Deliverable | Acceptance evidence |
|---|---|---|
| GT-001 | Capture baseline and protect current diff | Source snapshot/diff, test output and existing screenshots |
| GT-002 | Reproduce Gmail delivery problem | Sanitized Auth/provider log trail; confirmed or explicitly unknown root cause |
| GT-003 | Harden login feedback/retry/destination | Unit + browser tests for pending, errors, resend, expired link, callback |
| GT-004 | Verify/fix MapLibre worker bundling | Dev/preview worker response and rendered basemap screenshot |
| GT-005 | Split map/resource/GPS/data failure states | Forced-failure tests; fallback retains stop controls |
| GT-006 | Guard recipient polling across owner changes | Deferred-request regression and marker-clearing browser test |
| GT-007 | Add two-user fixture adapter and safe seed tooling | Local/staging-only checks, idempotency/run scoping, cleanup evidence |
| GT-008 | Add two-context Playwright happy/negative paths | Separate identities, private task test, sharing/stop test |
| GT-009 | Build tokens and shared UI states | Component examples, keyboard/focus checks, responsive screenshots |
| GT-010 | Simplify Home and calendar forms | Task-based usability results and regression tests |

Use small PRs per behavior; do not combine a renderer fix, design-system migration and SQL policy rewrite into one unreviewable change.

## 11. Verification, metrics and release gates

### Automated layers

- **Unit:** date/time, recurrence/overrides, task mutation/Undo, owner lifecycle, error mapping, location controller, import normalization.
- **Component:** form labels, pending/double-submit, retained input, dialogs/focus, error/empty states. Add appropriate React testing tooling rather than claiming domain tests cover rendered UI.
- **Database:** pgTAP/RLS for owner/recipient/member/stranger/anon/blocked cases and transactional concurrency.
- **E2E:** login, two-context social flow, task privacy, calendar, location stop/recovery, direct deep links and PWA update behavior.
- **Real device:** Android Chrome and iOS Safari/PWA foreground GPS, permission denial, safe areas, keyboard, screen reader and push where supported.

### Proposed targets, to baseline before enforcement

- No critical accessibility defects in core journeys; no keyboard traps or inaccessible destructive confirmations.
- Mobile LCP ≤2.5 seconds, INP ≤200 ms and CLS ≤0.1 under documented measurement conditions; lab scores are not field evidence.
- Initial Home JS gzip target ≤250 KB after route splitting, revised with measured dependency costs rather than hiding warnings.
- A working map appears within five seconds on the agreed test connection, or an actionable loading/failure state remains visible; this is not an external tile-provider SLA.
- Every loading/error/empty state distinguishable; no success message for an unconfirmed destructive outcome.
- All core two-user scenarios pass; private content never appears to unauthorized identities.
- At least four of five pilot participants complete the agreed core tasks without moderator help; treat the small sample as qualitative evidence, not a population statistic.

### Release checklist

- Fresh checkout/install/typecheck/unit/build and DB/E2E jobs pass against disposable infrastructure.
- Actual Gmail receipt/callback verified with controlled accounts; rate limits and failure handling documented.
- Map dev/build/device evidence collected; attribution and external service policies reviewed.
- Email/push/Edge Function logs contain no auth tokens, secret credentials, or location history.
- Backup/restore rehearsal completed; frontend rollback and migration compatibility documented.
- Staging approval precedes production deployment. Do not change unrelated `mcp.gnouht.space` infrastructure.

## 12. Ownership, risks and unresolved decisions

### Working model

If the previously requested two-agent arrangement is continued during implementation:

- **Primary implementer:** sole writer in a shared worktree; owns fixes and tests.
- **Oracle:** read-only advice on consequential domain/security decisions, not automatic implementation approval.
- **Reviewer:** read-only review of stable changes; receives exact scope and validation evidence.

No agent activity is required merely to make this document valid, and no additional agents were launched for this planning pass. A separate Advisor consultation was attempted, but the tool reported that no Advisor model was configured; this plan has not received that external review.

### Owner decisions

1. Primary pilot audience: close friends/students or families? Working assumption: a small trusted-friends pilot; do not remove family support based on that assumption.
2. Which two controlled email addresses may be used for actual delivery tests? Fixture addresses cannot validate Gmail.
3. Approve SMTP provider/domain access and any cost before configuration changes.
4. Choose weekly-routine semantics, week start and authoritative timezone.
5. Confirm sharing rules: friend-only vs explicit non-friend recipients; exact block/unfriend effects; position retention until expiry vs immediate revocation on leaving.
6. Approve any top-level navigation change only after prototype testing.
7. Confirm staging host and release owner. Test-user creation must not default to the current cloud project.

### Risk register

| Risk | Mitigation |
|---|---|
| Worker hypothesis is not the actual blank-map cause | Capture console/network/layout/WebGL evidence; test layers independently |
| Auth API success mistaken for inbox delivery | Separate accepted request, provider delivery and inbox receipt; inspect authorized logs |
| Reference repo license or maintenance changes | Pin versions/commits, preserve notices, recheck before adoption |
| UI redesign introduces dependencies without benefit | Pilot a few components and measure task completion before broad migration |
| Cached data crosses accounts | Owner-scoped keys, cleanup, lifecycle guards, deferred-request tests |
| Seed tooling affects real users | Explicit local/staging allowlist, server-only credentials, scoped disposable fixtures |
| Location privacy inferred from UI alone | Direct authenticated API/SQL tests and explicit block/revoke policy |
| Mock GPS creates false confidence | Separate fixture/E2E claims from physical-device and DB verification |
| Broad scope hides unfinished details | Phase exit gates, small PRs, explicit deferrals and acceptance evidence |

## 13. Explicitly deferred features

Until access, privacy and core journeys are dependable: native lock-screen widgets, reliable background tracking promises, AI notes, public social feeds, full chat, complex automation, and broad third-party calendar sync.

After the pilot, consider **one** validated feature at a time: suggested meeting slots from explicitly shared free/busy, opt-in mode-based invitations, or a private daily digest. Missing availability must remain “unknown,” not “free.”

## 14. Primary research sources

Use these sources to verify implementation decisions; repository contents are mutable.

1. [shadcn/ui README](https://github.com/shadcn-ui/ui/blob/main/README.md) and [license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md).
2. [Radix Primitives README](https://github.com/radix-ui/primitives/blob/main/README.md).
3. [Rallly README](https://github.com/lukevella/rallly/blob/main/README.md) and [license](https://github.com/lukevella/rallly/blob/main/LICENSE).
4. [Cal.diy README](https://github.com/calcom/cal.diy/blob/main/README.md) and [license](https://github.com/calcom/cal.diy/blob/main/LICENSE). GitHub API resolved the old Cal.com repository URL to Cal.diy during research.
5. [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js), [license/notices](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt), and [examples](https://maplibre.org/maplibre-gl-js/docs/examples/).
6. [OpenFreeMap quick start](https://openfreemap.org/quick_start/) — current explicit Vite worker setup.
7. [react-map-gl README](https://github.com/visgl/react-map-gl/blob/master/README.md) and [license/notices](https://github.com/visgl/react-map-gl/blob/master/LICENSE).
8. [TanStack Query README](https://github.com/TanStack/query/blob/main/README.md).
9. [Playwright README](https://github.com/microsoft/playwright/blob/main/README.md).
10. [OpenFreeMap community examples](https://github.com/w3cj/openfreemap-examples/blob/main/README.md).
11. [Novel README](https://github.com/steven-tey/novel/blob/main/README.md).
12. [Vaul maintenance notice](https://github.com/emilkowalski/vaul/blob/main/README.md).
13. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp) — default-service restrictions, custom SMTP and delivery practices.

**Definition of completion for this plan:** approved scope, traceable reference choices, reproducible blocker investigations, isolated two-user verification, actionable implementation phases, and measurable release criteria. Writing this plan does not complete any of those implementation gates.
