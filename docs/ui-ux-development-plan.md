# Gnouht Together — UI/UX and Product Development Plan

## 1. Recommendation and scope

**Status: proposal, not implementation or production-readiness approval.**

Evolve the existing React/Vite/Supabase app into a polished, Vietnamese-first personal planner and private coordination app. Do not replace it with a dashboard template or combine multiple open-source backends.

**Product promise:** Know what matters today, organize your own life, and make plans with people you trust—without exposing private information.

Working assumptions, subject to owner approval:
- Mobile-first web/PWA, with a productive desktop layout.
- Vy and Kha are the initial pilot users; support additional friends/groups without hard-coding either identity.
- Retain the warm-paper, dark-ink, lime visual identity, but improve hierarchy and consistency.
- Prefer reliable, complete journeys over adding many partially working features.
- Planning only: no account creation, dependency installation, database changes, deployment or production configuration is authorized by this document.

### Relationship to existing plans

Read this alongside `implementation-progress.md` for prior implementation evidence and `system-development-plan.md` for technical background. This document updates UI/UX priorities; it does not erase earlier work or attest to its current runtime health. Older plans contain stale test counts and already-addressed map/lazy-loading tasks; reconcile them during baseline rather than restarting that work.

## 2. Current baseline: strengths and gaps

This planning pass inspected source/configuration and prior reports. It did **not** rerun tests, perform an authenticated visual audit, verify cloud migrations, or test physical devices. The worktree already contains substantial tracked and untracked work; preserve it.

| Area | Existing foundation | Main improvement needed |
|---|---|---|
| Authentication | Magic-link flow, pending state, resend cooldown, safe return path, local/cloud help | Verify actual cloud email delivery, callback recovery and first-use onboarding |
| Design system | Semantic colors, Button/Card, Radix dialog, visible focus and reduced-motion CSS | Shared field/error/empty/loading patterns; consistent spacing, labels and destructive actions |
| Navigation | Five mobile tabs; extra desktop links | Tasks/notes/routines are nested under Me; improve discovery without adding more tabs |
| Today | Upcoming occurrences, task quick-add, completion/Undo, groups | Independently loading cards, actionable invitations, links from group items, clearer priorities |
| Calendar | Recurrence/exception engine, create dialog, ICS entry point | Mobile agenda, timezone clarity, import dedupe and error recovery |
| Organizer | One-off task list, notes, routines and reminders | Too many separate forms; notes lack an edit flow; some mutations lack error/pending handling |
| Meetups | Propose, vote, finalize, RSVP and comments | Long cards expose many forms; detail loading failures can look like empty results; incomplete mutation feedback |
| Inbox | In-app notifications and push settings | Preferences appear before messages; notification buttons only mark read; data loading depends on Home aggregation |
| Location | Extracted map, worker setup, recovery/stop controls and error states | People picker, permission clarity, physical-device tests, full revoke/block coverage |
| Testing | Unit tests, browser suite, local two-account script and SQL tests exist | Extend negative authorization, cross-browser, account-switch, real-email and device coverage |

Source anchors: `src/shared/ui/AppShell.tsx`, `src/styles.css`, `src/features/home/presentation/HomePage.tsx`, `src/features/meetups/presentation/MeetupsPage.tsx`, `src/features/personal/presentation/OrganizerPage.tsx`, `src/features/notifications/presentation/NotificationsPage.tsx`.

**Important distinction:** the prior progress report records successful local tests and a map worker repair. It also records that cloud migration 0013 and several release gates remain unverified/pending. Recheck current environments before acting; do not assume localhost means a local database.

## 3. Open-source reference strategy

### Selection criteria

Evaluate candidates on task fit, mobile interaction quality, accessibility, documentation, maintainership/security response, license obligations, compatibility and bundle cost. GitHub popularity is not a sufficient quality measure. The shortlist below is based on primary project documentation/license inspection, not a full security audit or hands-on certification.

| Project | Relevant strengths | Decision for this app | License boundary |
|---|---|---|---|
| [shadcn/ui](https://github.com/shadcn-ui/ui) | Customizable component source; consistent forms, menus, tabs and dialogs | Select a small set of components and restyle them with existing tokens; do not import a whole template | MIT repository; inspect each registry item's dependencies and notices |
| [Radix Primitives](https://github.com/radix-ui/primitives) | Unstyled accessible interaction primitives | Keep the already-used Radix family for dialogs and new interactive primitives | MIT; integration still needs accessibility testing |
| [Rallly](https://github.com/lukevella/rallly) | Availability polls, response overview, comments and finalization | Reference the workflow; build an original private-group implementation using existing domain rules | AGPL-3.0-or-later; no code/assets copied without license review and an explicit distribution decision |
| [Vikunja](https://github.com/go-vikunja/vikunja) | Quick add, task filters, due dates, recurring tasks and alternative views | Reference task discovery and progressive detail; start list-first, not with Gantt/Kanban complexity | Main code AGPL-3.0-or-later; desktop portion GPL; reference-only in this plan |
| [FullCalendar](https://github.com/fullcalendar/fullcalendar) | Calendar views and interaction APIs | Keep existing integration; improve surrounding mobile agenda/forms rather than rewrite recurrence | Inspected core license MIT; premium plugins have separate terms and are not included automatically |
| [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | Map controls, markers, bounds and renderer examples | Keep existing renderer; polish sharing controls and fallbacks | BSD-3-Clause; map tiles/styles/data have separate attribution and usage terms |
| [TanStack Query](https://github.com/TanStack/query) | Async server-state caching, invalidation and pagination | Conditional pilot on tasks or Inbox; adopt further only if it reduces complexity safely | MIT; owner-scoped keys and logout cleanup are mandatory |
| [Playwright](https://github.com/microsoft/playwright) | Browser isolation and Chromium/Firefox/WebKit automation | Extend existing tests rather than create another test stack | Apache-2.0; browser tests are not physical GPS/push validation |

### Specific adoption safeguards

- The inspected shadcn changelog now defaults new projects to Base UI while retaining Radix support. Explicitly select Radix-compatible components to avoid accidental mixing or an unnecessary migration.
- Do not adopt Vaul by default: its current README says it is unmaintained. A supported Radix-based responsive dialog can provide the initial mobile sheet behavior without a gesture library.
- Do not port Rallly's anonymous-voting default into private groups. Authorization requirements belong to this product.
- Do not add a rich-text editor, map wrapper, global state library or form framework without a concrete need and a bounded compatibility spike.
- Before adopting any package/source: inspect the exact release/commit, latest release/issue/security signals, transitive dependencies, install scripts, React 19/Tailwind 4/Vite 8/TypeScript 7 compatibility and size impact.
- Record vendored files, origin commit, modifications, license text and attribution in `THIRD_PARTY_NOTICES.md` when reuse occurs. Do not imply that studying a feature requires importing its repository.

## 4. Target experience and navigation

### Five essential journeys

1. **Get started:** sign in → confirm display name/timezone → understand privacy → optionally connect with a friend. Skipping invitations must still lead to a useful personal planner.
2. **Plan today:** see today's agenda → add a task → complete/Undo → find future tasks.
3. **Arrange a meetup:** pick people/group → propose times → collect votes → confirm → RSVP → see the plan in the appropriate calendar.
4. **Respond:** open an invitation/change/reminder → reach the authorized object → act → receive clear feedback.
5. **Share temporarily:** choose recipients and duration → explicitly enable GPS → see active sharing → stop/revoke with confirmed server outcome.

### Navigation prototype

Test this proposal against the current navigation before implementing it:

| Primary destination | Contents |
|---|---|
| Today / Hôm nay | Agenda, tasks due, pending invitations, quick add, active-sharing indicator |
| Planner / Kế hoạch | Calendar, Tasks, Routines and Notes via clear secondary tabs |
| Together / Cùng nhau | Friends, groups, meetup plans; contextual access to shared location |
| Inbox / Thông báo | Actionable invitations, changes and reminders; settings behind a secondary action |
| Me / Tôi | Profile, timezone, appearance, privacy, active sessions, data export/deletion |

Keep five mobile destinations maximum. Desktop can show useful sub-navigation without changing the conceptual model. Preserve existing URLs with compatible routes/redirects if navigation changes. Validate Vietnamese labels with users rather than treating translations above as final.

### Today layout concept

```text
Good morning, Vy                    Inbox badge
Tuesday, 6 October                  + Add

NEXT UP
18:30  Dinner with Kha               View plan

YOUR TASKS                          See all
[ ] Prepare weekend plan            Today
[ ] Book a table                     Today
+ Add a task

NEEDS YOUR RESPONSE
Kha proposed 3 meeting times         Vote

[Only while active: sharing with Kha · 25 min · Stop]

Today   Planner   Together   Inbox   Me
```

This is a proposed layout using illustrative content, not an implemented screen or evidence that either account exists. Empty accounts get useful guidance, not fictional live activity.

## 5. Visual design and reusable components

### Visual direction

- Calm, friendly and personal—not an enterprise dashboard with charts everywhere.
- Keep warm neutrals and lime highlights; use semantic success/warning/danger colors independently of branding.
- Limit type sizes, border radii and elevation variants; use a 4/8-pixel spacing rhythm.
- Prefer readable 16px body/input text, restrained page headings on small screens and uncluttered metadata.
- One primary action per section; move advanced settings behind progressive disclosure.
- Support system/light/dark appearance, reduced motion, zoom and mobile safe areas.
- Use consistent Vietnamese terminology and date/time formatting; store text centrally enough to add another language later without undertaking a full translation project now.

### Shared component backlog

`PageHeader`, `Field`, `AsyncButton`, `EmptyState`, `ErrorState`, `Skeleton`, `StatusBadge`, `ConfirmDialog`, `PersonPicker`, `FilterBar`, `ResponsiveDialog`, `Toast/Undo`, and `PrivacyAudienceSummary`.

Each component needs documented variants, keyboard interaction, programmatic labels, pending/disabled/error states and light/dark examples. Start with a lightweight internal component showcase; add Storybook only if its ongoing benefit justifies another tool.

**Acceptance:** WCAG 2.2 AA-oriented review; no keyboard traps; visible focus; at least 44×44px touch targets for primary interactions; usable at 320/390/768/1280px and 200% zoom; errors announced appropriately; no color-only meaning. Automated checks supplement—not replace—VoiceOver/TalkBack testing.

## 6. Functional roadmap

Priority meanings: **P0** = correctness/privacy/release blocker; **P1** = core pilot UX; **P2** = post-pilot enhancement.

| Workstream | Priority | Planned changes | Acceptance evidence |
|---|---|---|---|
| Authentication/onboarding | P0/P1 | Verify delivery/callback, editable name and timezone, optional friend invitation, privacy introduction | Fresh/returning login, expired link, throttling, network failure and safe invite-return tests; actual email receipt checked separately |
| Async correctness | P0 | Add owner/unmount guards consistently, serialize mutations, retain input, expose recoverable errors; audit remaining social/organizer/Inbox screens | Deferred responses after logout/account-switch cannot render old user's content; double submit does not duplicate actions |
| Today | P1 | Independent card queries/states, compact agenda, grouped tasks, clickable groups, invitation summary, contextual quick add | Task quick-add within three deliberate control actions excluding typing; one failing card does not blank the page |
| Task management | P1 | Easy discovery, overdue/today/upcoming/no-date/completed filters, pagination, edit/delete confirmation, reliable Undo | Future/undated items reachable; large lists not silently truncated; edits retain unchanged timestamps |
| Calendar | P1 | Mobile agenda default, day/week/month choice, clear timezone/audience, create/edit occurrence vs series | Home and Calendar agree on moved/canceled/all-day/DST occurrences; keyboard alternative to drag/drop |
| ICS import | P1 | UID-based owner-scoped dedupe, preview, explicit unsupported recurrence handling, import summary and partial-failure recovery | Reimport doesn't silently duplicate; malformed/timezone/all-day cases covered; no misleading all-success message |
| Routines | P1 after decision | Clear daily/weekly period progress; timezone/week-start semantics | UI and server compute the same period across boundaries; weekly success is not mislabeled as today's status |
| Notes | P1 | List/search, create/edit, save feedback, input preservation, delete confirmation | Failed save retains edits; unauthorized users cannot read notes; rich text remains optional |
| Friends/groups | P1 | Person picker, request-state feedback, invite preview, member/role view, expired-link recovery | Two accounts complete request → accept → invite → join; role and block/unfriend behavior tested at API/DB level |
| Meetups | P1 | Short list cards plus focused detail view; guided creation; mobile voting; response counts including not-yet-voted; finalize summary | Vy/Kha pilot can propose/vote/finalize/RSVP; capacity remains transactionally enforced; errors never masquerade as no votes |
| Inbox | P1 | Messages first, settings second, unread grouping, pagination, deep links and safe actions | Each category opens relevant authorized content; removed/revoked targets show a safe unavailable state |
| Location | P0/P1 | Recipient picker, explicit expiry, timestamps/stale state, map/list fallback, persistent discoverable stop action | Owner/recipient/stranger/blocked/anon tests; stop deletes or denies access server-side; foreground GPS checked on two real devices |
| Activity modes | P1 polish | Compact optional card, audience/expiry disclosure, clear off state | No inference from GPS, no push on every change, expired/blocked visibility correctly enforced |
| Reminders/push | P0 before enabling | Verify server scheduling, dedupe/retry, preferences and quiet-hours timezone; explain device limitations | In-app record remains available when push fails; controlled end-to-end delivery test |
| Profile/privacy | P0/P1 | Timezone, notification settings, active-sharing review, data export and deliberate account deletion | Explicit confirmation and authorization; deletion/export results verified in disposable environment |

### Later enhancements, chosen from pilot feedback

- Suggested meeting slots from **explicitly shared** free/busy; unshared availability means unknown, never automatically free.
- Saved task filters, subtasks or a simple board if list view proves insufficient.
- Private daily digest and opt-in activity-based invitations with rate limits.
- Calendar export and external synchronization as separate scoped projects.

Defer full chat, public feeds, AI assistants, rich collaborative documents, location history, native widgets and promises of reliable background tracking. They add substantial cost/privacy surface without resolving the current core UX gaps.

## 7. Architecture and data changes

Keep the current feature/domain/infrastructure structure, Supabase RLS/RPC enforcement, Temporal recurrence logic, FullCalendar and MapLibre. No Next.js migration or replacement backend is proposed.

1. Extract typed feature queries from `AppData` incrementally; Inbox should not fetch Home's calendar/tasks/groups just to show notifications.
2. Pilot TanStack Query on one vertical slice if justified. Keys include owner identity and filters; cancel and clear private caches on account change. Preserve existing lifecycle protections until equivalent tests prove the replacement.
3. Use optimistic UI only for reversible low-risk actions with rollback. Never show a confirmed location stop, successful invitation or completed deletion before the server confirms it.
4. Keep map/calendar/import code lazy-loaded. Existing lazy-loading work is a foundation, not a new deliverable to repeat.
5. Do not persist private query caches or GPS through the service worker. Offline mode must say which operations are unavailable, not pretend writes are synchronized.
6. Add migrations only when required: import UID/batch identity, routine periods, structured notification targets or sharing policy changes. Reuse existing schema where adequate.
7. Each migration needs RLS/direct-API tests, upgrade compatibility, staging rehearsal, backup and rollback/forward-fix guidance. UI checks alone never enforce privacy.
8. Capture sanitized operational failures; exclude auth links/tokens, task/note content, private email addresses and raw coordinates from telemetry.

## 8. Delivery phases, dependencies and estimates

Estimates are **engineering working days for one experienced implementer**, including tests and review. They are not elapsed-time guarantees. Re-estimate after Phase 0; account for owner feedback, SMTP/domain access, device availability and staging approvals separately.

| Phase | Estimate | Deliverables | Exit gate |
|---|---:|---|---|
| 0. Baseline and decisions | 2–3 days | Preserve existing diff; inventory implemented vs pending; reproduce core journeys; screenshots/test baseline; choose pilot scope and privacy/time rules | Reproducible environment, known blockers and approved scope; no user work lost |
| 1. UX prototype and foundation | 4–6 days | Navigation comparison, Today/planner/meetup/inbox prototypes, selected tokens/components, accessibility examples, dependency/license spike | Owner approves direction; 3–5 representative users can find core tasks; component checks pass |
| 2. Daily planning vertical slice | 5–7 days | Onboarding improvements, Today, tasks, mobile calendar, essential notes/routine fixes and scoped ICS improvements | Add/edit/complete/Undo/calendar journeys pass; timezone decisions reflected in tests |
| 3. Coordination vertical slice | 5–8 days | Friends/groups, focused meetup flow, actionable Inbox, activity polish and recipient picker | Two-user coordination happy paths plus unauthorized/revoked cases pass |
| 4. Integration and reliability | 4–6 days | Expand lifecycle/RLS coverage, approved staging migrations, email/reminder/push verification, physical GPS tests and performance work | No unresolved critical/high privacy or correctness defects; external blockers explicitly resolved or feature disabled |
| 5. Pilot and release | 3–5 days | Vy/Kha pilot, small usability study, fixes, backup/restore rehearsal, deployment/rollback runbook | Owner accepts pilot results; clean CI, verified recovery and deployment approval |

**Total core scope: 23–35 engineering days, roughly 5–7 working weeks before contingency and external delays.** Budget an additional 20–30% contingency; enhanced ICS/routines or newly requested features may require separate estimates. P2 enhancements are excluded.

Dependencies:
- Phase 0 precedes all implementation. P0 correctness/privacy findings are fixed immediately; they do not wait until Phase 4.
- Phase 1 design decisions precede broad UI migration.
- Phases 2 and 3 can be planned independently after Phase 1, but this estimate assumes one serial implementer.
- Phase 4 validates integrated results from Phases 2–3; Phase 5 requires those gates to pass.
- SMTP/staging approvals should be requested in Phase 0 because they can block the release despite frontend progress.

### First implementation tickets

| ID | Scope | Depends on | Done when |
|---|---|---|---|
| UX-01 | Baseline existing diff, routes, source/test status and environment | None | Evidence recorded; no reset/overwrite of current work |
| UX-02 | Decide audience, routine/timezone and sharing rules | UX-01 | Written decisions and acceptance examples |
| UX-03 | Prototype mobile navigation + four core screens | UX-01 | Current/proposed flow comparison and owner feedback |
| UX-04 | Shared field, feedback, confirm and picker primitives | UX-03 | Component states, keyboard/contrast checks and notices |
| UX-05 | Owner-switch/error/pending audit on remaining pages | UX-01 | Regression tests for stale responses, errors and duplicate mutations |
| UX-06 | Today + task discovery vertical slice | UX-04, UX-05 | Independent loading and complete quick-add/edit/Undo journey |
| UX-07 | Calendar/routine semantics and import recovery | UX-02, UX-04, UX-05 | Time-boundary and import re-run tests |
| UX-08 | Focused meetup flow + actionable Inbox | UX-04, UX-05 | Two-context propose/vote/finalize/respond tests |
| UX-09 | Friend/group/recipient selection and revocation | UX-02, UX-04, UX-05 | Authorized and forbidden access matrix passes |
| UX-10 | Staging pilot and release checklist | UX-06–UX-09 | Real-email/device evidence, CI and recovery checks accepted |

Use small behavior-focused PRs. Do not bundle a navigation rewrite, cache migration and SQL authorization change into one large change set.

## 9. Vy and Kha pilot plan

- Use Vy and Kha as display names in future fixtures and usability scripts. Existing An/Bình demo/test data has not been renamed by this planning task.
- Real cloud magic-link users need owner-controlled deliverable email addresses, or a separately approved supported sign-in method. Reserved `.test` addresses do not validate cloud email sign-in.
- Local fixtures may use `vy@example.test` and `kha@example.test`, clearly labeled as testing. Existing Auth script is local-only; do not bypass its guard for cloud.
- Real staging users require explicit backend/account approval and scoped cleanup. Never expose service-role credentials in browser code, chat or committed files.

Pilot script:
1. Vy and Kha sign into independent sessions and set names/timezones.
2. Each creates a private task, note and calendar event; the other cannot retrieve those records.
3. They connect and join a test group.
4. Vy proposes three times; Kha votes; Vy confirms; Kha RSVPs.
5. Notification links open the correct authorized plan.
6. Vy explicitly shares foreground location with Kha, reloads without automatic GPS acquisition, and stops sharing.
7. Test expiry, denied GPS, loss of network, block/unfriend and late responses after account switching.
8. Add stranger and anonymous identities/contexts for negative cases that two connected users cannot cover.

Use fictional public-place coordinates in demos. Actual device location testing is opt-in, temporary and excluded from logs/screenshots wherever possible. Two participants establish functional pilot behavior, not a statistically meaningful usability success rate.

## 10. Quality gates and success measures

### Automated and manual layers

- Unit/domain: recurrence/DST, period boundaries, permissions, mutations/Undo, async ownership and import normalization.
- Rendered UI: labels, pending/error/input retention, focus return and confirmation flows.
- Playwright: two independent users, deep links, mobile/desktop layouts, browser engines, errors and account-switch races.
- Database/API: owner, recipient, group member, stranger, anonymous and blocked access; capacity concurrency; expired/revoked sharing.
- Device: iOS Safari/PWA and Android Chrome foreground GPS, safe areas, software keyboard, screen reader and push where supported.
- Operations: clean install, migrations on disposable infrastructure, CI, SMTP/callback, scheduler, backup/restore and rollback.

### Targets to baseline, then enforce

| Dimension | Initial target |
|---|---|
| Task usability | At least 4 of 5 study participants finish create task, find future task, vote and stop sharing without help; small-sample qualitative signal |
| Privacy understanding | Participants can correctly identify recipients and duration before starting sharing |
| Accessibility | No serious/critical automated issues or manual keyboard blockers in core flows; manual contrast/screen-reader review |
| Performance | Aim for mobile p75 LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 once field samples are sufficient; use documented lab conditions before that |
| Bundle | Establish route-level budgets in Phase 0; Home must not load map/calendar/import dependencies unnecessarily |
| Reliability | No silent mutation failure, duplicate submission or cross-account stale content in the agreed regression suite |
| Release | Clean CI plus real staging/device evidence, no unresolved critical/high security/correctness defects, tested recovery |

Collect minimal, consent-aware task-completion/timing data. Do not log personal task titles, message contents or coordinates for analytics.

## 11. Owner decisions and risks

### Decisions needed before relevant implementation

1. Is this primarily for a close-friends/personal pilot, families, or a broader audience? Default proposal: trusted-friends pilot, without removing family support.
2. Approve/refine the warm neutral/lime visual direction and navigation prototype.
3. Choose authoritative timezone, week start and once-per-week versus selected-day routine semantics.
4. Confirm recipient eligibility and immediate block/unfriend/revocation behavior, including what remains after leaving the location page.
5. Provide controlled Vy/Kha emails if cloud pilot accounts are desired; approve SMTP/staging access and any service cost.
6. Confirm timeline, release owner and monthly budget for Supabase, email, map services, hosting and monitoring. No arbitrary cost quote before workload/provider choices.

### Principal risks

- Scope growth: freeze core pilot acceptance; move extra features to P2.
- Dirty worktree conflicts: preserve baseline, separate existing work from new commits; never reset user edits.
- Accessible primitive mistaken for accessible screen: test labels, content, order and focus in context.
- Reference license/maintenance changes: recheck exact commits and notices before reuse; exclude unmaintained dependencies.
- Private state survives account switch: owner-scoped data lifecycle and delayed-response regression tests.
- Existing frontend and cloud schema differ: reconcile migration history with approval before staging/production rollout.
- Browser limitations: no promises of reliable background GPS, universal push delivery or native lock-screen widgets.
- Operational delay: request access early; never describe API acceptance as delivered email or local tests as cloud validation.

**Production boundary:** no unapproved database reset, real-user creation or deployment. Preserve the existing `mcp.gnouht.space` DNS/tunnel/Access configuration.

## 12. Research sources and review status

Primary sources inspected during this planning pass:
- [shadcn README](https://github.com/shadcn-ui/ui/blob/main/README.md) and [Base UI default / Radix support changelog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/content/docs/changelog/2026-07-base-ui-default.mdx).
- [Radix README/license declaration](https://github.com/radix-ui/primitives/blob/main/README.md).
- [Rallly README/features/license declaration](https://github.com/lukevella/rallly/blob/main/README.md).
- [Vikunja README/license boundaries](https://github.com/go-vikunja/vikunja/blob/main/README.md) and [feature overview](https://vikunja.io/features/).
- [TanStack Query license](https://github.com/TanStack/query/blob/main/LICENSE).
- [FullCalendar README](https://github.com/fullcalendar/fullcalendar/blob/main/README.md) and [core license](https://github.com/fullcalendar/fullcalendar/blob/main/LICENSE.md).
- [MapLibre README/license declaration](https://github.com/maplibre/maplibre-gl-js/blob/main/README.md).
- [Playwright README](https://github.com/microsoft/playwright/blob/main/README.md).
- [Vaul maintenance notice](https://github.com/emilkowalski/vaul/blob/main/README.md).

Sources are mutable; these references are not pins or security endorsements. No source code was copied and no dependencies were added in this planning pass.

Advisor review was requested, but the tool returned **“Advisor model not configured.”** The proposal therefore has no independent Advisor approval. Validate this plan with the owner before implementation.
