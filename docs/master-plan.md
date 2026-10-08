# Gnouht Together — Master Development Plan

**Status:** approved 2026-10-07 · Phases 0 to 10 are implemented in a reduced form on branch `refactor/foundation`; Phase 11 has not started. Section 3.13 lists what was built differently, section 10 what is open, and `docs/implementation-progress.md` what each phase contains and leaves out
**Supersedes:** the earlier roadmap, system plan, UI/UX plan and implementation plan, which were removed from `docs/` on 2026-10-07 and remain in git history. `docs/implementation-progress.md` is the running log.

---

## Context

Gnouht Together works feature by feature, but three things now hold it back:

1. **The code is not organized the way the docs say.** The docs describe "presentation → application → domain → repositories". In the code, the domain classes are used only by tests, there is no application layer, and pages talk to Supabase adapter singletons directly. Every new feature means editing many unrelated files.
2. **It does not yet feel like one app on phone and desktop.** On a phone, half the features are not in the tab bar. Screens are stacks of forms. The desktop layout is the phone layout made wider.
3. **You want many more features**, and the current structure makes each one expensive.

**Decisions you confirmed for this plan**

| Topic | Decision |
|---|---|
| Phones | **PWA only** — one installable web app, no App Store / Play Store build |
| Audience | **Friends and classmates** |
| Big features | **Realtime chat**, **timetable + calendar sync**, **realtime friend location** |
| Not included | Bill splitting, AI assistant, native apps (listed under "Not in this plan") |

**Intended outcome**

- A modular, class-based codebase where **adding a feature = one new module folder + one line in a registry**.
- One adaptive interface that is comfortable on a phone, a tablet and a desktop.
- A phased roadmap where every phase ends with a working, testable app.

**One consequence to know before approving.** A PWA cannot read GPS in the background. Browsers stop location updates when the app is hidden or the screen locks (this is especially strict on iOS). So "realtime friend location" in this plan means **live while the person sharing has the app open**. The design handles this honestly (keep-screen-awake option, a visible "paused" state instead of a frozen dot, and a "ask for location" push). The location code sits behind an interface, so a native wrapper could be added later without changing the rest.

---

## 1. Where the app is today

**Stack.** React 19 · TypeScript 7 · Vite 8 · Tailwind 4 · React Router 7 · Supabase (magic-link Auth, Postgres with RLS, 49 SQL functions, 2 Edge Functions) · FullCalendar 7 · MapLibre GL 6 · Temporal polyfill · ical.js · Radix Dialog · vite-plugin-pwa. Tests: Vitest, Playwright (mocked), pgTAP. About 4,900 lines in `src`, 26 tables, 14 migrations.

**Working today.** Magic-link sign-in, profile, friends (request / accept / block), groups with invite links, meetups with time polls and RSVP, calendar with recurrence and exceptions, `.ics` import (single events), tasks, notes, routines, reminders, in-app notifications, optional Web Push, expiring location sharing with a map, six activity modes, data export, account deletion.

### Gaps this plan closes

| Area | Finding | Evidence |
|---|---|---|
| Architecture | Domain classes are dead code outside tests | `Group`, `Meetup`, `PersonalTask`, `LocationSharingSession` are imported only by `src/domain.test.ts` |
| Architecture | No application layer, no repository interfaces | Pages import `appData`, `calendarData`, `friendsData`… directly |
| Architecture | One class spans five features, and `shared` depends on `features` | `src/shared/infrastructure/AppData.ts` (tasks, home, profile, location, account; imports from `features/calendars` and `features/home`) |
| Architecture | Business logic in the wrong layer | Recurrence engine lives in `calendars/infrastructure/CalendarData.ts`; `LocationController` (domain) imports an infrastructure type |
| Architecture | 11 deep imports between features, no public API per feature | e.g. `CalendarPage` → `friends/infrastructure/FriendsData` |
| Architecture | Every page re-implements loading, locking and account-switch safety | `AsyncOwnerScope` + lock refs + reset effects in 9 files; 22 `useState` in `CalendarPage` and in `MeetupsPage` |
| Architecture | Adding one thing means editing several hard-coded lists | Activity modes are listed in 2 SQL checks, 1 client array and 1 UI list; routes are listed in `AuthenticatedApp.tsx`, `AppShell.tsx` and `auth/domain/login.ts` |
| Architecture | Errors are recognized by matching English text; DB rows leak into the UI | `humanize()`, `groupError()`, `loginError()`; snake_case fields and 11 `any` in components |
| UX | Meetups, friends, location and the organizer are not in the phone tab bar | `src/shared/ui/AppShell.tsx` |
| UX | No detail pages; other people's RSVPs are never shown | `MeetupsPage.tsx` renders polls, invites and comments inline in each list card |
| UX | People are chosen by typing exact usernames | Friend add, meetup invite, and location recipients ("comma-separated usernames") |
| UX | Dark mode is half-wired | Color tokens switch on a `.dark` class that nothing sets; `dark:` utilities follow the OS |
| PWA | An installed iOS app cannot finish magic-link sign-in | The link opens Safari, which has separate storage from the installed app |
| PWA | No update prompt, no PNG / Apple icons, no shortcuts or badge | `vite.config.ts` uses `registerType: "prompt"` but no code shows a prompt; manifest has one SVG icon |
| Realtime | Nothing is realtime | Location polls every 15 s, modes every 60 s |
| Notifications | Social notifications never send a push | Only `supabase/functions/process-reminders` calls web-push |
| Backend | Finished server features with no UI | `list_blocked_users`, `unblock_user`, `revoke_group_invite`, `update_meetup_details`, `set_group_availability_share`, `find_profile_by_username`; columns `personal_tasks.tags`, `profiles.birthday / interests`, `meetups.response_deadline / location_address` |
| Ops | Large uncommitted working tree; migrations 0013–0014 not on the cloud project | `git status`, `README.md` |
| Ops | This machine is only half set up for the checks | The default Node is 18.19.1, on which Vite 8 and Vitest 4 cannot start (`package.json` needs ≥ 22.12). A Node 22.23.3 exists under `~/.local/share/pi-node/` and runs everything. The user account has no Docker access, so local Supabase and pgTAP cannot start |

### Baseline run on 2026-10-07

Run with Node 22.23.3 on the working tree as it is (uncommitted changes included).

| Check | Result |
|---|---|
| Typecheck (`tsc -b`) | Pass |
| Unit tests (Vitest) | 50 of 50 pass, 10 files |
| Production build | Pass, with one chunk-size warning (the map chunk) |
| Browser tests (Playwright, mocked backend, dev server) | 15 of 15 pass |
| pgTAP database tests, two-real-user script | Not run — both need Docker |
| Clean `npm ci` install, preview-mode browser run | Not run |

---

## 2. Rules that hold for the whole plan

1. **Strangler migration, never a big-bang rewrite.** After every step the app builds, tests pass and it can be deployed. Old and new code live side by side until a module is fully moved.
2. **The server stays the authority.** Row Level Security and SQL functions decide who can see or change data. Client checks are for user experience only.
3. **Privacy rules stay.** Private by default; sharing is always an explicit choice; only the latest location is stored, never a history; status is chosen by the user, never guessed from GPS.
4. **Every database change is a migration with a pgTAP test.** No hand-edited cloud SQL. Cloud changes need your approval. `mcp.gnouht.space` DNS, tunnel and Access settings are never touched.
5. **Expand, then contract.** Installed PWAs can run an old build for days. A migration must keep the previous client working for one release; removals come one release later. A `min_client_version` check forces very old clients to update.
6. **Vietnamese-first UI**, with all text in message catalogs so a second language is possible later.
7. **Re-plan at each phase boundary.** Each phase starts with a short implementation plan and ends with its exit gate.

---

## 3. Target architecture (clear OOP structure)

### 3.1 Layers and the dependency rule

```
presentation ──▶ application ──▶ domain ◀── infrastructure
React pages,      use cases,      entities, value      Supabase repositories,
view-model        DTOs            objects, policies,   realtime, storage,
hooks                             repository           browser APIs
                                  interfaces
      ▲                                                       ▲
      └──────────────── app/ (composition root) ──────────────┘
          builds the container, registers modules, owns the shell
```

- **Domain** knows nothing about React, Supabase or the browser. It holds the rules.
- **Application** holds one class per user intention (a *use case*). It talks to interfaces, not to Supabase.
- **Infrastructure** implements those interfaces.
- **Presentation** shows state and forwards intentions. It never imports Supabase.
- **Classes** are used for entities, value objects, repositories, use cases, controllers, gateways and modules. React components and hooks stay functions and stay thin.

### 3.2 Folder layout

```
src/
  app/                    composition root — the only place that knows every module
    main.tsx  App.tsx  container.ts  modules.ts  router.tsx
    providers/            Auth, Session, Query, Theme, I18n, Realtime
    shell/                AppShell, TopBar, BottomTabBar, NavRail, Sidebar,
                          QuickAdd, CommandPalette, UpdatePrompt, OfflineBanner
  kernel/                 shared building blocks
    domain/               Entity, ValueObject, DomainError, Clock, UserTime, DateKey,
                          TimeRange, Audience, Page, DomainEvent
    application/          UseCase, Container, Token, Controller, EventBus,
                          ports (RealtimeGateway, FileStorage, KeyValueStore, Logger)
    infrastructure/       supabase/ (typed client, SupabaseRepository, error mapper,
                          realtime gateway, storage), memory/ (in-memory helpers)
    module/               FeatureModule contract, ExtensionPoint, ModuleRegistry
    ui/                   design system: tokens, primitives, patterns, format, i18n
  modules/
    identity/ tasks/ habits/ notes/ calendar/ timetable/ availability/
    friends/ groups/ meetups/ chat/ location/ presence/ notifications/
    today/ search/
```

Every module has the same inside:

```
modules/tasks/
  domain/           Task.ts  DueDate.ts  Priority.ts  TaskRepository.ts (interface)
  application/      CreateTask.ts  CompleteTask.ts  UndoCompletion.ts  ListTasks.ts  TaskDto.ts
  infrastructure/   SupabaseTaskRepository.ts  taskMapper.ts  InMemoryTaskRepository.ts
  presentation/     pages/  components/  viewmodels/  widgets/
  tasks.module.ts   what this module contributes to the app
  index.ts          the only file other modules may import
```

### 3.3 Kernel building blocks

| Building block | Purpose | Replaces today |
|---|---|---|
| `Entity`, `ValueObject` | Identity, equality, immutable updates, invariants in one place | Interfaces that mirror DB rows |
| `AppError` family (`DomainError`, `NotFoundError`, `PermissionError`, `ConflictError`, `RateLimitError`, `NetworkError`) with a stable `code` | Typed failures mapped to Vietnamese text in one catalog | `humanize()`, `groupError()`, `loginError()` |
| `Clock`, `UserTime`, `DateKey`, `TimeRange` | One definition of "today", time zones and ranges | 5 copies of local-date helpers, 25 ad-hoc `toLocale…` calls |
| `Audience` | "Who can see this": only me · all friends · a friend list · chosen people · a group · public | A visibility enum plus per-feature username text boxes |
| `UseCase<Input, Output>` | One class per user intention, constructor-injected dependencies | Logic inside page components |
| Repository interfaces + `SupabaseRepository` base class + row mappers | Persistence behind an interface; the owner id is applied once, in the constructor | `AppData` and the `*Data` singletons |
| `Container`, `Token`, `SessionContainer` | Dependency injection without a framework; one object graph per signed-in user | Module-level singletons |
| `Controller<State>` | Long-lived client processes with observable state (`subscribe` / `getState`) | The callback wiring in `LocationController` |
| `EventBus`, `DomainEvent` | Modules react to each other without importing each other | Cross-feature imports |
| `RealtimeGateway` | Typed server → client events | Polling |
| `FeatureModule`, `ExtensionPoint`, `ModuleRegistry` | The plugin contract (section 3.5) | Hard-coded route, tab and category lists |

### 3.4 What a module looks like (tasks as the example)

```ts
// modules/tasks/domain/Task.ts
export class Task extends Entity<TaskId> {
  static create(input: NewTask, clock: Clock): Task      // validates title, applies defaults
  static rehydrate(snapshot: TaskSnapshot): Task         // from storage
  complete(clock: Clock): Task
  reopen(expectedCompletedAt: string): Task              // Undo is safe against later changes
  reschedule(due: DueDate | null): Task
  isOverdue(today: DateKey): boolean
  toSnapshot(): TaskSnapshot                             // plain object for UI and cache
}

// modules/tasks/domain/TaskRepository.ts
export interface TaskRepository {
  list(filter: TaskFilter, page: PageRequest): Promise<Page<Task>>;
  get(id: TaskId): Promise<Task | null>;
  save(task: Task): Promise<void>;
  remove(id: TaskId): Promise<void>;
  undoCompletion(id: TaskId, completedAt: string): Promise<void>;
}

// modules/tasks/application/CompleteTask.ts
export class CompleteTask implements UseCase<{ id: TaskId }, TaskSnapshot> {
  constructor(private tasks: TaskRepository, private clock: Clock, private events: EventBus) {}
  async execute({ id }: { id: TaskId }) { /* load → task.complete() → save → publish TaskCompleted */ }
}

// modules/tasks/presentation/viewmodels/useTaskList.ts  (thin React binding)
export function useTaskList(filter: TaskFilter) {
  const { listTasks, completeTask } = useTasks();        // resolved from the session container
  const query = useQuery({ queryKey: taskKeys.list(filter), queryFn: () => listTasks.execute(filter) });
  const complete = useMutation({ mutationFn: completeTask.execute /* optimistic + rollback */ });
  return { tasks: query.data, status: query.status, complete: complete.mutate };
}
```

Entities stay inside use cases. The UI and the cache only see plain snapshots.

### 3.5 The plugin contract — how the app grows

```ts
// kernel/module/FeatureModule.ts
export interface FeatureModule {
  readonly id: string;
  register(c: SessionContainer, backend: "supabase" | "memory"): void;  // bind repositories + use cases
  readonly routes?: RouteContribution[];
  readonly navigation?: NavContribution[];
  readonly contributions?: Contribution[];       // values for typed extension points
}

// kernel/module/ExtensionPoint.ts
export class ExtensionPoint<T> { constructor(readonly id: string) {} }

// example: the timetable module plugs into the calendar and into Today
contributions: [
  contribute(CalendarSources, (c) => new TimetableSource(c.get(TIMETABLE_REPOSITORY))),
  contribute(TodayWidgets, { id: "next-class", order: 20, component: NextClassWidget }),
]
```

| Extension point | Declared by | Used for | What it removes |
|---|---|---|---|
| `routes` | kernel | The router and the safe return-path list after sign-in | Route lists in `AuthenticatedApp.tsx` and `auth/domain/login.ts` |
| `navigation` | kernel | Bottom tabs, navigation rail, sidebar, unread badges | The arrays in `AppShell.tsx` |
| `QuickActions` | kernel | The "+" button and the command palette | Per-page add forms as the only entry point |
| `ShellIndicators` | kernel | App-wide banners such as "Đang chia sẻ vị trí · Dừng" | Indicators visible on one page only |
| `SettingsSections` | kernel | The settings and privacy screens | Settings scattered across pages |
| `RealtimeHandlers` | kernel | Sending each server event to the right module | Polling timers |
| `TodayWidgets` | `today` | The Today dashboard; each widget loads and fails on its own | `AppData.home()` |
| `NotificationHandlers` | `notifications` | Icon, text, deep link and inline buttons per category | The category list in `NotificationsPage.tsx`; generic links like `/meetups` |
| `CalendarSources` | `calendar` | Events, classes, meetups, birthdays and external calendars merged into one calendar | A calendar that only knows `calendar_events` |
| `SearchProviders` | `search` | Global search results and actions | — (new) |

Any module can declare its own extension point and export it from its `index.ts`, so new kinds of plug-ins never require a kernel change. Adding a feature later means: create `modules/<name>/`, add it to `app/modules.ts`. No shell file changes.

### 3.6 Session scope — account safety by construction

- On sign-in the app creates a `SessionContainer` for that user: repositories (already bound to the user id), use cases, controllers, a **new** TanStack Query client and the realtime channel.
- The signed-in tree is rendered as `<SessionProvider key={user.id}>`. Switching account remounts everything and discards the old container and cache.
- This replaces the per-page `AsyncOwnerScope` + lock + reset code. A late response from the previous account lands in a discarded cache and cannot reach the screen.
- `AsyncOwnerScope` stays until the last legacy page is gone; its tests become session-level tests.

### 3.7 Presentation rules

1. Pages compose components. No Supabase import, no business rule.
2. **Reads** use `useQuery` inside a view-model hook that calls a query use case.
3. **Writes** use `useMutation` calling a command use case. Optimistic updates only for reversible, low-risk actions (complete a task, vote, react, mark read). Anything destructive or privacy-related waits for the server (stop sharing, delete, block, invite).
4. **Long-lived processes** (GPS publishing, an open chat thread, a timer) are `Controller` classes read with `useSyncExternalStore`.
5. Every screen has loading (skeleton), empty, error (retry) and offline states built from shared pattern components.
6. All text comes from message catalogs; all dates go through shared formatters.

### 3.8 Realtime design

One private channel per signed-in user: `user:{userId}`.

- The **server** sends events to it from database triggers through one helper, `private.emit(user_id, event, payload)`, which calls Supabase's `realtime.send(...)`.
- Authorization is one RLS policy on `realtime.messages`: a user may only listen to their own topic. Because the trigger chooses the recipients **at send time**, removing a recipient, unfriending or blocking takes effect on the very next event. (Supabase caches channel permissions for the life of a connection, so per-friend channels would revoke late; this design avoids that.)
- Each module registers handlers for its events (`chat.message`, `location.position`, `notification.created`, `presence.status`…). Handlers patch the query cache or a controller.
- Realtime can drop messages, so on reconnect and when the app becomes visible again, live queries are refetched. Slow polling stays as a fallback while the channel is not connected.
- Typing indicators use short-lived client broadcasts on `chat:{conversationId}` (members only).

### 3.9 Backend organization

- **Helpers in a `private` schema** (not callable from the browser): `are_friends`, `is_blocked_between`, `can_contact`, `notify`, `emit`, `revoke_relationship_grants`. They replace the friendship / block sub-queries that are repeated 23 times across 8 migrations.
- **All `SECURITY DEFINER` functions**: empty `search_path`, schema-qualified names, `EXECUTE` revoked from `public` and `anon` and granted to `authenticated` (migration 0013 already does this; 0001–0010 do not).
- **Stable error codes**: functions raise short tokens (`capacity_reached`, `not_friends`…) documented in `docs/error-codes.md`; the client maps tokens to Vietnamese text.
- **Generated types**: `supabase gen types` → `kernel/infrastructure/supabase/database.types.ts`; CI fails when they drift from the migrations.
- **Migration names**: `NNNN_<module>_<change>.sql`.
- **Edge Functions**: shared code in `supabase/functions/_shared/` (auth guard, admin client, push sender). Domain code that the server also needs (recurrence expansion) is bundled from `src` by a small build script so client and server run the same engine. This needs a short spike to confirm it runs on Deno.
- **One notification pipeline**: every producer calls `private.notify(...)`, which writes the in-app row, emits a realtime event and queues a push. The queue worker reuses the claim / retry / recover pattern from `process-reminders/index.ts`.

### 3.10 Module catalog

| Module | Domain objects | Example use cases | Absorbs today's files |
|---|---|---|---|
| `identity` | Profile, Username, UserTime, Preferences | SignInWithCode, UpdateProfile, ExportMyData, DeleteAccount | `bootstrap/AuthProvider`, `features/auth/*`, `ProfilePage`, profile and account methods of `AppData` |
| `tasks` | Task, TaskList, Subtask, DueDate, QuickAddParser | CreateTask, CompleteTask, UndoCompletion, ListTasks | Task methods of `AppData`, `TaskListCard`, Home quick-add, `PersonalTask.ts` |
| `habits` | Habit, HabitSchedule, Streak | CreateHabit, MarkHabitDone, UndoHabitDone | Routine parts of `OrganizerData` and `OrganizerPage` |
| `notes` | Note, NoteTag | SaveNote, PinNote, SearchNotes | Note parts of `OrganizerData` and `OrganizerPage` |
| `calendar` | CalendarEvent, Occurrence, RecurrenceRule, RecurrenceExpander, CalendarSource, IcsCodec | CreateEvent, EditOccurrence, EditSeries, ListOccurrences, ImportIcs, ExportIcs | `CalendarData.ts` (engine moves to domain), `CalendarPage`, `SharedCalendarPage`, `IcsImportCard`, `icsImport.ts`, `home/domain/upcoming.ts` |
| `timetable` | Timetable, ClassSession, WeekPattern, TimetableImporter | ImportTimetable, SaveClass, CancelClassOnce | new |
| `availability` | BusyInterval, FreeSlot, FreeSlotFinder | ShareAvailability, FindCommonFreeTime | Busy / share methods of `FriendsData` |
| `friends` | Friendship (state machine), FriendList, Block | SendRequest, Respond, Unfriend, Block, CreateInviteLink | `FriendsData`, `FriendsPage` |
| `groups` | Group, Membership, GroupInvite, GroupPolicy | CreateGroup, CreateInvite, RevokeInvite, ChangeRole, TransferOwnership | `GroupsData`, `Groups*Page`, `Group.ts` |
| `meetups` | Meetup (state machine), TimePoll, Rsvp, Place | ProposeMeetup, InvitePeople, Vote, ConfirmTime, Respond | `MeetupsData`, `MeetupsPage`, `Meetup.ts` |
| `chat` | Conversation, Message, Reaction, ReadState | SendMessage, React, MarkRead, Mute | `meetup_comments` flow |
| `location` | LocationSession, Position, Precision, LocationPublisher | StartSharing, StopSharing, ListVisibleFriends, RequestLocation | Location methods of `AppData`, `LocationController`, `LocationSharingPage`, `MapCanvas`, `LocationSharingSession.ts` |
| `presence` | ActivityStatus, StatusCatalog | SetStatus, ClearStatus, ListFriendStatuses | `ActivityModesData`, `ActivityModesCard` |
| `notifications` | Notification, NotificationPreferences, PushSubscription | ListNotifications, MarkRead, EnablePush | `NotificationsData`, `PushData`, `NotificationsPage` |
| `today` | — (composes widgets) | — | `HomePage`, `AppData.home()` |
| `search` | SearchProvider, SearchResult | Search | new |

### 3.11 Guardrails so the structure stays clean

- **Architecture lint (dependency-cruiser) in CI**: domain imports only kernel domain; application never imports infrastructure, React or Supabase; presentation never imports infrastructure; modules import each other only through `index.ts`; `kernel` never imports `modules`.
- **ESLint + Prettier**; one format-only commit so later diffs stay readable. TypeScript 7 support of the lint tooling is checked first; oxlint or Biome is the fallback.
- **Path aliases** `@app`, `@kernel`, `@modules`.
- **Test pyramid**: domain unit tests → use-case tests with in-memory repositories → repository contract tests (same suite against in-memory and Supabase) → pgTAP for RLS and SQL functions → component tests → Playwright.
- **In-memory backend mode** (`VITE_BACKEND=memory`): the whole app runs on seeded fake repositories (An and Bình). It replaces the single demo page and the network-mocked browser tests.
- **"How to add a module" guide** in `docs/module-guide.md`.

### 3.12 Reuse, do not rewrite

| Existing code | Reuse as |
|---|---|
| `expand()` and helpers in `calendars/infrastructure/CalendarData.ts` | Moved (not rewritten) into `RecurrenceExpander`; existing tests come along |
| `location-sharing/domain/LocationController.ts` + its 9 tests | Base of `LocationPublisher extends Controller` |
| `location-sharing/presentation/MapCanvas.tsx`, `infrastructure/maplibre.ts` | Map component; gains avatar markers and smooth movement |
| `shared/ui/DialogPanel.tsx` | Base of the responsive modal (sheet on phone, dialog on desktop) |
| `auth/domain/login.ts` (`safeReturnPath`, `loginError`, `isLocalBackend`) | Kept; the allow-list is generated from registered routes |
| `notifications/infrastructure/NotificationsData.ts` (`notificationDestination`) | Becomes the fallback notification handler |
| `personal/infrastructure/OrganizerData.ts` (`dateKeyInTimeZone`, `mondayOfWeek`) | Moved into `UserTime` / `DateKey` |
| `calendars/infrastructure/icsImport.ts` | Start of `IcsCodec` |
| `supabase/functions/process-reminders/index.ts` | Pattern for the push queue worker |
| `scripts/local-two-user-check.mjs` | Becomes a Playwright "two real users" project |
| `features/demo/domain/people.ts` | Seed data for the in-memory backend |
| Unused SQL functions listed in section 1 | Wired to UI instead of being rewritten |

**Dependencies.** Add `@tanstack/react-query`, more Radix primitives, `@testing-library/react`, ESLint / Prettier, dependency-cruiser. Remove `motion` (installed, never imported) unless the design system ends up needing it.

### 3.13 What was built differently

The work followed one rule: build a piece when something uses it. The layers and the dependency rule above hold in the code. These are the differences.

| Planned | Built | Reason |
|---|---|---|
| One class per use case | A service class per module only where a rule sits between the screen and the repository (`TaskService`); elsewhere screens call the repository interface | The single-use classes were pass-through code |
| `Container` and `Token` classes | A module's `create(session)` builds its services; `useModule(module)` returns them | Same injection with no container to maintain |
| `ExtensionPoint` class and ten extension points | Eleven optional fields on `FeatureModule`: `create`, `routes`, `navigation`, `indicator`, `privacy`, `settings`, `searchItems`, `today`, `stats`, `agenda`, `friendSignals` | Each field was added when a second module needed it |
| `Entity`, `ValueObject`, `Audience`, `EventBus`, `UserTime`, message catalog | Not built. Entities are plain classes: `Task`, `Habit`, `Membership`, `Profile`, `MeetupPolicy` | Nothing needed the base classes |
| `Controller<State>` base class | `LocationController` alone, with `subscribe` and `getState` | There is one long-lived process |
| `RealtimeGateway` with typed handlers per module | `RealtimeBridge`: an event reloads the queries whose key starts with its name | Reloading is enough at this size, and no handler can drift from the query it serves |
| Plain snapshots for the UI | Screens use the entity objects | Snapshots are needed once the cache is stored on the device, which was not built |
| 16 modules | 14. Timetable and availability live in `calendar`; search is a dialog in `app/` fed by the modules | They share the calendar's repository and repeat engine |
| Message catalogs with named keys | `t("…")` with the Vietnamese text as the key, and one dictionary for each other language (`kernel/i18n.ts`, `kernel/locales/en.ts`) | No key names to invent or keep in step; the code stays readable in the language it was written in. Built when English was asked for |
| `kernel/ui` design system with a gallery | `Button`, `Card`, `DialogPanel`, `Popover`, the confirm dialog, `ThemeSwitch` | Each was added when a second screen needed it; there is no gallery |
| FullCalendar for the calendar grid | The app draws its own week list, month and hour grid (`calendar/domain/calendarView.ts`, `CalendarBoard`) | The library's theme could not follow the app's look or its dark mode, every entry had one color, and it cost about 68 kB (gzip) on the calendar screen |
| dependency-cruiser, ESLint, Prettier, path aliases, Testing Library | `src/architecture.test.ts` checks the import rules; the rest is not added | One test file covers the rules without new tooling |
| In-memory backend mode | Browser tests mock the HTTP API | No second implementation of every repository to keep in step |
| Route names `/plan/*`, `/together/*`, `/inbox` | The old addresses stay | Notifications already stored in the database link to them |
| Generated database types | Not done | Needs a running database |
| Database tests need Docker | `npm run test:db` runs them on an embedded Postgres | Docker is not available on the development machine |
| Server-side recurrence for feeds, bundled from `src` | `supabase/functions/_shared/ics.ts` has no imports and is loaded by both the web app and the function | No build step between the two |

---|---|---|
| One class per use case | One service class per module (`TaskService`); a use case gets its own class when it grows | The single-use classes were pass-through code |
| `Container` and `Token` classes | A module's `create(session)` builds its services; `useModule(module)` returns them | Same injection with no container to maintain |
| `FeatureModule` with extension points | `create` and `routes` only | Navigation, widgets and notification handlers are added in the phase that first uses them |
| Plain snapshots for the UI | Screens use the entity objects | Snapshots are only needed once the cache is stored on the device (Phase 10) |
| dependency-cruiser, ESLint, Prettier, path aliases, Testing Library | `src/architecture.test.ts` checks the import rules; the rest is not added | One test file covers the rules without new tooling; TypeScript 7 support of the lint tools is still unverified |
| `EventBus`, `Controller`, `Audience`, `RealtimeGateway`, `UserTime`, message catalog | Not built yet | No user in Phase 1 |
| Generated database types | Not done | Needs a running database |
| Database tests need Docker | `npm run test:db` runs them on an embedded Postgres | Docker is not available on the development machine |

---

## 4. Experience design for phone, tablet and desktop

### 4.1 Navigation

Five destinations, the same on every screen size:

| Tab | Route | Contains |
|---|---|---|
| **Hôm nay** | `/` | What is next, tasks due, things waiting for your answer, friends right now |
| **Kế hoạch** | `/plan/*` | Lịch · Việc · Thói quen · Ghi chú · Thời khóa biểu |
| **Trò chuyện** | `/chat/*` | Conversations (from Phase 4; until then this slot is Thông báo) |
| **Cùng nhau** | `/together/*` | Bạn bè · Nhóm · Hẹn · Bản đồ · Rảnh lúc nào? |
| **Tôi** | `/me/*` | Profile, settings, privacy |

Notifications move to a bell with an unread badge in the top bar (`/inbox`). Because navigation comes from the module registry, changing the tab layout later is a configuration edit.

**Routes and redirects** (old links, including links stored in existing notifications, keep working):

| New route | Old route |
|---|---|
| `/plan/calendar` | `/calendar` |
| `/plan/tasks`, `/plan/tasks/:id`, `/plan/habits`, `/plan/notes`, `/plan/notes/:id` | `/me/organizer` |
| `/plan/timetable` | — |
| `/chat`, `/chat/:conversationId` | — |
| `/together/friends`, `/together/friends/:userId` | `/me/friends`, `/calendar/shared/:ownerId` |
| `/together/groups`, `/together/groups/:groupId/*` | `/groups`, `/groups/:groupId` |
| `/together/meetups`, `/together/meetups/:meetupId` | `/meetups` |
| `/together/map` | `/me/location` |
| `/together/free-time` | — |
| `/inbox` | `/notifications` |
| `/invite/group/:token`, `/invite/friend/:token` | `/invite/group/:token` |

### 4.2 Adaptive shell

| Width | Navigation | Layout | Input |
|---|---|---|---|
| Phone < 640 px | Top bar (title, back, bell) + bottom tab bar + "+" button | One column; details are pushed pages; forms and menus are bottom sheets | 44 px touch targets, swipe actions, pull to refresh, safe-area padding, 16 px inputs (stops iOS zoom on focus) |
| Tablet 640–1023 px | Navigation rail (icon + label) | List and detail side by side where it helps | Touch and keyboard |
| Desktop ≥ 1024 px | Sidebar with sections and sub-items | Two panes (list · detail); details can open as a side panel | Hover actions, right-click menus, drag and drop, keyboard shortcuts, Ctrl/Cmd+K |

One routing pattern (a list route with a nested detail route) gives "pushed page on phone, second pane on desktop" for tasks, notes, chat, meetups, friends and groups.

### 4.3 Design system (`kernel/ui`)

- **Tokens** declared with Tailwind `@theme`, so classes read `bg-surface text-ink` instead of `bg-[var(--surface)]`. The warm paper / dark ink / lime identity stays. Semantic success, warning and danger colors. 4 / 8 px spacing rhythm. Type scale 12 / 14 / 16 / 20 / 24 / 32.
- **Theme**: system / light / dark through a `data-theme` attribute and a matching Tailwind `dark` variant. This fixes the half-wired dark mode.
- **Primitives** (Radix-based where interactive): Button, IconButton, Input, Textarea, Select, Checkbox, Switch, SegmentedControl, Tabs, ResponsiveModal (sheet / dialog / side panel), ConfirmDialog, DropdownMenu, Popover, Tooltip, Toast with Undo, Avatar, Badge, Chip, Skeleton, Spinner.
- **Patterns**: PageHeader, ListRow (swipe and hover actions), Section, EmptyState, ErrorState, OfflineState, Field (label + help + error), FilterBar, PeoplePicker, AudiencePicker, AudienceSummary, DateTimeField, QuickAddSheet, Fab.
- **Gallery**: a dev-only route `/dev/ui` shows every component in both themes (no Storybook).

### 4.4 Interaction patterns

- **Quick add.** One "+" on phone, the `N` key and a header button on desktop. One sheet with type chips (Việc · Sự kiện · Ghi chú · Hẹn · Trạng thái). It understands "mai 9h", "thứ 6", "tuần sau".
- **Feedback.** Toast with Undo for reversible actions, a confirm dialog for destructive ones, inline field errors. No `window.confirm`.
- **Manage mode.** Multi-select with bulk actions (complete, move, delete, mark read) on tablet and desktop; long-press to select on phone.
- **Progressive disclosure.** One primary action per screen. Repeat, audience and reminders sit under "Thêm tùy chọn".
- **Empty states teach**: one sentence and one button.
- **Privacy is always visible.** An audience chip ("Chỉ mình tôi", "3 bạn", "Nhóm …") on anything shareable, and an app-wide indicator while location is shared.

### 4.5 PWA capabilities

| Capability | Plan | Platform note |
|---|---|---|
| Install | PNG icon set, Apple touch icon, manifest screenshots, an install hint (button on Android / desktop; "Chia sẻ → Thêm vào Màn hình chính" guide on iOS) | iOS has no install prompt API |
| Sign-in | 6-digit email code typed inside the app; magic link kept as a fallback | A magic link opens Safari, not the installed app |
| Updates | "Có bản mới — Cập nhật" toast via the PWA register hook | Today an update waits until every tab is closed |
| Push | Every notification category; an explainer before the permission prompt | iOS: only after installing to the Home Screen |
| App icon badge | Unread count through the Badging API | Check support on each target device |
| Shortcuts | Manifest shortcuts: Thêm việc, Lịch hôm nay, Bản đồ, Trạng thái | Android / desktop |
| Share target | Share text or a link into Gnouht to make a note or task | Android |
| Keep awake | Screen Wake Lock while live sharing | In an installed iOS app only from iOS 18.4 |
| Offline | App shell always opens; optional local copy of your own planner data | See feature C6 |
| Safe areas | `viewport-fit=cover` and `env(safe-area-inset-*)` | Notch and home-bar devices |

### 4.6 Accessibility and performance

- WCAG 2.2 AA-oriented: programmatic labels, focus order and focus return, visible focus, no color-only meaning, reduced motion, 200 % zoom, a keyboard path for every drag action. Automated checks (axe) plus a manual VoiceOver / TalkBack pass.
- **Performance baseline** (gzip, build of 2026-10-07):

  | What loads | JavaScript (gzip) |
  |---|---:|
  | Sign-in screen | about 145 KB (entry 82 + Supabase 55 + routes and button 8) |
  | First signed-in screen (Today) | about 172 KB (the above + calendar engine with Temporal 21 + Today 6) |
  | Opening the calendar | + about 95 KB (FullCalendar 68 + page 14 + dialog 13) |
  | Opening the map | + 284 KB, plus a 144 KB worker |
  | Opening `.ics` import | + 25 KB |
  | Service-worker precache | 46 files, about 1.2 MB |

- **After Phase 1**: sign-in 154 KB, Today 185 KB. The 13 KB added to Today is the query library and the session code.
- **Budgets**: the first signed-in screen stays under 200 KB while the shell and design system are added; Today never loads calendar-grid, map or ICS code; chat and long lists are virtualized. Lighthouse numbers are still to be measured.

### 4.7 Screen by screen

| Screen | Phone | Desktop | Main change from today |
|---|---|---|---|
| Hôm nay | Greeting and status chip; "Tiếp theo" (events, classes, meetups merged); tasks due; "Cần bạn trả lời"; friends now | Two-column dashboard | Widgets load and fail independently |
| Lịch | Agenda list by default; day / week / month switch; source filter chips | Week or month grid with drag and drop; event side panel | One sheet to create, view and edit |
| Việc | Sections Quá hạn / Hôm nay / Sắp tới / Không hạn; swipe to complete | List + detail pane; bulk actions | Lists, tags, subtasks, due time |
| Thói quen | Today's habits as large check rows with streaks | Adds a 12-week heatmap | Schedules, streaks, Undo |
| Ghi chú | Pinned and recent; full-screen editor | List + editor | Edit in place, search, tags |
| Thời khóa biểu | Day swiper with class cards | Week grid | New |
| Trò chuyện | Conversation list → thread; composer stays above the keyboard | List + thread | New |
| Bạn bè | Search; requests on top; friend rows with live status | List + friend profile pane | Add by link or QR; friend profile |
| Nhóm | Group cards → hub with tabs | Hub with tabs and side info | Chat, calendar, shared tasks, members in one place |
| Hẹn | Cards (title, time, my answer) → detail page | List + detail | Detail page, wizard, participants |
| Bản đồ | Full-screen map; bottom sheet with friends | Map + side list | Live movement, avatars, share sheet |
| Rảnh lúc nào? | Pick people → ranked slots | Heatmap grid | New |
| Thông báo | Grouped list with inline actions | Same, in a panel | Deep links; accept / RSVP in place |
| Tôi | Profile card + settings list | Settings with sections | Privacy center |

---

## 5. Feature catalog

Each item lists what users get, the main model and database work, and when it counts as done.

### A. Kế hoạch (planner)

**A1. Tasks v2** — upgrade
- *Users get:* lists (per course or project), tags, due date with optional time, subtasks, a notes field, manual order, smart sections, search, quick add with Vietnamese date phrases, one reminder per task, a "deadline" type with countdown, swipe to complete with Undo.
- *Model / DB:* `Task`, `TaskList`, `Subtask`, `DueDate`, `QuickAddParser`. New `task_lists`. `personal_tasks` gains `list_id`, `parent_id`, `notes`, `position`, `kind`, and `due_on date` + `due_time time` (a calendar day instead of today's "23:59 local" timestamp). Keyset pagination.
- *Done when:* adding a task takes at most 3 taps on a phone; 1,000 tasks page smoothly; the existing task tests pass against the new use cases.

**A2. Habits v2** — upgrade of routines
- *Users get:* daily, chosen weekdays, or N times per week; streak and best streak; 12-week heatmap; Undo for today; reminder time; archive.
- *Model / DB:* `Habit`, `HabitSchedule`, `Streak`. Habits move out of `personal_tasks` into `habits` with the same ids, so `routine_completions` only needs its foreign key re-pointed. `mark_habit_done`, `undo_habit_done`. Done as expand → contract.
- *Done when:* UI and server compute the same period at midnight and at week boundaries in the profile time zone (the cases in `OrganizerData.test.ts` carry over).

**A3. Notes v2** — upgrade
- *Users get:* pin, tags, search, simple formatting with checklists, autosaved drafts, links to an event, meetup or class.
- *DB:* `personal_notes` gains `pinned_at`, `tags`; an accent-insensitive search index.
- *Done when:* a failed save never loses text; searching "hop nhom" finds "họp nhóm".

**A4. Calendar v2** — upgrade
- *Users get:* agenda / day / week / month; source filters; one event sheet with place, description, color, repeat, audience and reminders; richer repeat rules (every N weeks, chosen weekdays, yearly, end by date or count); "this event / this and following / all events"; drag and drop on desktop; event reminders; full `.ics` import (repeating events, no duplicates on re-import, undo an import) and `.ics` export.
- *Model / DB:* `CalendarEvent`, `RecurrenceRule` (stored as an RFC 5545 rule), `RecurrenceExpander`, `Occurrence`, `CalendarSource`. `calendar_events` gains `location_name`, `color`, `rrule`, `reminder_offsets`, `external_uid`, `import_batch_id`. New `import_batches`. A rolling `calendar_occurrences` window, filled by the shared engine, lets the server send reminders and answer free/busy.
- *Done when:* Today, Calendar and free/busy agree for repeating, moved, canceled, all-day and daylight-saving cases; importing the same file twice adds nothing; a reminder push arrives for a later occurrence with the app closed.

**A5. Timetable** — new
- *Users get:* semester setup; weekly class grid; class details (room, lecturer, notes, linked deadlines); cancel or move a class for one date; several semesters; import by hand, by pasted table / CSV, or `.ics`; classes appear in the calendar and count as busy; optional class reminders; optional automatic "Đi học" status during class.
- *Model / DB:* `Timetable`, `ClassSession`, `WeekPattern` (every week / alternating / listed weeks), `TimetableImporter` strategy with one adapter per format. `timetables`, `timetable_entries`, `timetable_exceptions`.
- *Needed from you:* one sample export from your school portal, to write the school-specific importer.
- *Done when:* a full semester shows correctly in the week view and the agenda; a canceled class disappears from busy time.

**A6. "Rảnh lúc nào?" free-time finder** — new
- *Users get:* choose friends or a group, a date range, a duration and a time window → ranked common free slots and a heatmap. People who do not share availability show as "chưa rõ", never as free. One tap turns the best slots into a meetup poll. Group-level availability sharing gets a UI (the SQL function already exists).
- *Model / DB:* `FreeSlotFinder` domain service; `list_busy_projection` (titles never leave the owner; friendship and blocks are re-checked on every call).
- *Done when:* results match a hand-checked fixture of three people with classes and repeating events.

**A7. Focus timer** — stretch. A Pomodoro timer linked to a task and the "Học bài" status.

### B. Cùng nhau (together)

**B1. Friends v2** — upgrade
- *Users get:* add by personal link or QR code; username search; a friend profile page (status, shared calendar, common groups, buttons to message, meet or share location); friend lists such as "Bạn thân" used by every audience picker; nicknames; birthdays in the calendar; a blocked-users screen.
- *DB:* `friend_invites`, `friend_lists`, `friend_list_members`; `search_profiles` (minimum 3 characters, rate limited); `private.revoke_relationship_grants` called on unfriend and on block.
- *Done when:* unfriend or block immediately removes location, availability, event and status visibility in both directions (pgTAP and a two-browser test).

**B2. Groups hub** — upgrade
- *Users get:* one hub per group with tabs Tổng quan · Trò chuyện · Lịch · Việc chung · Thành viên · Cài đặt; invite management (list, revoke, multi-use, QR); promote and demote admins; group picture; shared task lists with assignees; group meetups reach every member.
- *DB:* `set_group_member_role`; a trigger keeps `member_count`; `task_lists.group_id` and `task_assignees`; an `avatars` storage bucket.
- *Done when:* every destructive action asks for confirmation and reports failure; the last owner cannot leave.

**B3. Meetups v2** — upgrade
- *Users get:* a detail page; a 4-step wizard (what → who → when → where); participants with their answers; an answer deadline with reminders; a place with a map pin; edit details; mark done; templates (Cà phê, Học nhóm, Bi-a…); suggested times from the free-time finder; the confirmed meetup in every participant's calendar; a chat thread; "Đang tới" arrival sharing.
- *DB:* uses the existing `location_name`, `location_address`, `meeting_url`, `response_deadline` and `update_meetup_details`; adds `place_lat`, `place_lng`, `list_meetup_participants`, automatic invitation of group members; notifications carry the meetup id.
- *Done when:* two users go from proposal to confirmed plan to arrival without leaving the meetup page; capacity stays transaction-safe.

**B4. Chat** — new
- *Users get:* direct messages between friends, one chat per group, one thread per meetup; replies, emoji reactions, typing indicator, unread badges, mute, edit (15 minutes) and delete own messages; push with quiet hours and optional hidden previews; photos as a second step.
- *Model / DB:* `Conversation`, `Message`, `Reaction`, `ReadState`, `ChatConversationController` (paging, optimistic send with a client-made id, retry, de-duplication). `conversations`, `conversation_members`, `messages`, `message_reactions`. Writes go only through SQL functions (`send_message` is idempotent). Triggers fan messages out to members' user topics. Existing `meetup_comments` are migrated.
- *Said plainly in the UI:* messages are protected by server access rules; they are not end-to-end encrypted.
- *Done when:* messages arrive in about 2 s; history and unread counts survive a reload; a removed or blocked user can neither read nor send (checked with direct API calls).

**B5. Live friend map** — new, built on location sharing
- *Users get:* a map with friends' avatars moving live; accuracy ring; "2 phút trước" staleness; a share sheet (who · how long: 15 min / 1 h / 4 h / until I turn it off · exact or approximate); an app-wide "Đang chia sẻ vị trí · Dừng" indicator; "Tàng hình" (pause everything at once); "Hỏi vị trí" (a push asking a friend to share); one-shot "Mình tới rồi" check-in; a hint showing who is watching now.
- *Model / DB:* `LocationPublisher` (adaptive rate: faster when moving, a heartbeat when still; Wake Lock; a final "paused" signal when the app is hidden) and `FriendLocationsController`. `location_sessions` gains `mode` and `paused_at`. Recipients must be friends and not blocked. `location_watch` leases make positions fan out only to people who have the map open, which keeps realtime usage low. `location_requests`. Server-side rate limit. Scheduled deletion of positions of ended sessions.
- *Limits of a PWA:* live only while the sharer's app is open; Wake Lock inside an installed iOS app needs iOS 18.4 or newer.
- *Done when:* with both phones open, movement shows within about 5 s; locking the sharer's phone shows "tạm dừng" within a minute; Stop or Tàng hình removes the marker in about 2 s and the stored position is gone; tested outdoors on two real phones.

**B6. Status v2 (activity modes)** — upgrade
- *Users get:* the six modes plus custom emoji and text; an audience per status; live updates; a "Rủ…" nudge button on a friend's status (rate limited); status on Today, friend rows and map markers.
- *DB:* `status_catalog` replaces the hard-coded lists; `user_statuses` with audience.
- *Done when:* adding a mode is one catalog row and no code change.

### C. Platform

**C1. Notifications v2.** One pipeline; push for every category; deep links to the exact object; inline actions (accept, RSVP, vote); grouping; mark all read; badge on the tab, the bell and the app icon; realtime toasts; cleanup of old read items. *Done when* every category opens the right object, and a deleted or revoked target shows a safe "không còn khả dụng" state.

**C2. Search and command palette.** Each module provides results (tasks, notes, events, friends, groups, meetups, conversations) and actions. Phone: a search screen. Desktop: Ctrl/Cmd+K.

**C3. Sign-in and onboarding.** 6-digit email code typed in the app; optional Google sign-in later. First-run wizard: name, username (validated, availability check), picture, time zone (auto-detected), privacy intro, import timetable, add friends by link, enable push with per-platform instructions, install tips.

**C4. Settings and privacy center.** Who can see my status, location, calendar and availability; every active share with a one-tap revoke; blocked users; calendar feed links; notification settings; theme; data export; account deletion; sign out everywhere.

**C5. Calendar sync.**
1. *Feed out* — a private, revocable link per user that Google or Apple Calendar can subscribe to (an Edge Function renders `.ics`).
2. *Subscribe in* — paste any `.ics` link (for example Google Calendar's "secret address"); synced on a schedule; shown read-only; counts as busy.
3. *Google account connection* (optional, last) — read-only first, then writing confirmed meetups back. Google limits unverified apps to 100 test users and expires their connections after 7 days, so this needs Google's verification before wider use.

Steps 1 and 2 already give two-way visibility without any Google approval.

**C6. Offline.** The app shell always opens. Optional local copy of your own planner data (tasks, notes, habits, your calendar and timetable), wiped on sign-out. Quick-add is queued while offline. Other people's data and GPS are never stored on the device. This changes an earlier project rule and is confirmed again at Phase 10.

### Not in this plan

Bill splitting · AI assistant · native / store apps and home-screen widgets · background location · end-to-end encrypted chat · public profiles or discovery · location history.

---

## 6. Defects found while reading the code

These come from reading the source and SQL, not from running it. Each one gets a failing test first, then the fix.

| # | Finding | Where | Fixed in |
|---|---|---|---|
| 1 | Unfriending does not remove availability shares or location recipients; blocking removes location recipients but not availability shares. An ex-friend can keep reading busy times. | `remove_friend` (0003), `block_user` (0004), `get_shared_busy` (0006) | Phase 1 |
| 2 | Location can be shared **to** any username, with no friendship or block check. | `start_location_session` (0007) | Phase 1 |
| 3 | Anyone can be invited to a meetup by username, which sends them a notification. | `invite_to_meetup` (0003) | Phase 1 |
| 4 | The last position of an **expired** session stays in the table; it is deleted only on an explicit stop. | `location_positions`, `stop_location_session` | Phase 1 |
| 5 | Older `SECURITY DEFINER` functions keep the default `EXECUTE` for everyone and use `search_path=public`. `is_group_member(g, u)` answers for any pair of ids. `prepare_account_deletion` can be called directly. | 0001–0010 | Phase 1 |
| 6 | Free/busy ignores repetition: only the first occurrence of a repeating event counts as busy. | `get_shared_busy` (0006) | Phase 6 |
| 7 | Monthly events on the 29th–31st drift to a shorter day forever after a short month (each step adds one month to the previous result). | `addRecurrence` in `CalendarData.ts` | Phase 6 |
| 8 | Social notifications never push. | Only `process-reminders` sends Web Push | Phase 3 |
| 9 | Group meetups are invisible to group members who were not invited one by one. | `create_meetup`, `MeetupsData.list` | Phase 7 |
| 10 | Group management buttons have no error handling and no confirmation; one tap archives a group. | `GroupManagePage.tsx` | Phase 3 |
| 11 | `member_count` is updated by hand in three functions and missed in account deletion. | 0003, 0004, 0005 | Phase 3 |
| 12 | Dark tokens never apply. | `src/styles.css` | Phase 2 |
| 13 | Installed iOS app cannot complete sign-in. | `AuthPage.tsx` | Phase 2 |
| 14 | No update prompt; users stay on an old build. | `vite.config.ts` | Phase 2 |
| 15 | Task due dates use the device's "23:59" while habits use the profile time zone. | `AppData.createTask` | Phase 8 |
| 16 | Re-importing an `.ics` file duplicates events. | `IcsImportCard.tsx` | Phase 6 |
| 17 | Dead code: `AppData.createGroup`, `createEvent`, `markRead`; Home loads notifications it never shows. | `AppData.ts` | Phase 1 |
| 18 | Invite links and reminders fail where pgcrypto lives in the `extensions` schema, because three functions pin `search_path` to `public`. | `create_group_invite`, `claim_group_invite` (0003), `schedule_personal_reminder` (0004) | Phase 1 |

**Status on 2026-10-07.** Fixed, each with a test: 1–4, 6–14 and 16–18. Defects 1–5 were first reproduced on an embedded Postgres. Defect 5 turned out to be more than hygiene: an anonymous caller who knew a user id could read that user's busy times. Migration 0015 closes that, and migration 0026 stops `is_group_member` and `is_group_admin` from answering a caller outside the group. One part of defect 5 is open: `prepare_account_deletion` can be called directly, by a user for their own account only. Defect 15 is open; it needs a due-date column and belongs to tasks v2. Defect 18 was found while testing; it was reproduced on an embedded Postgres laid out like Supabase and still has to be confirmed on the real project. None of the migrations 0013–0029 is applied to a Supabase project yet.

---

## 7. Delivery phases

Estimates are engineering days for one developer, including tests. They are rough and are redone at the start of each phase.

| Phase | Goal | Days | Release |
|---|---|---:|---|
| 0 | Baseline and safety net | 2–3 | R1 |
| 1 | Architecture foundation, two pilot modules, security fixes | 8–12 | R1 |
| 2 | Design system, adaptive shell, sign-in, PWA basics, Today | 10–14 | R1 |
| 3 | Friends, groups, realtime platform, notification pipeline | 12–16 | R2 |
| 4 | Chat | 9–12 | R2 |
| 5 | Live friend map, status v2 | 9–13 | R2 |
| 6 | Calendar v2 | 12–16 | R3 |
| 7 | Timetable, free-time finder, meetups v2 | 13–18 | R3 |
| 8 | Tasks, habits, notes v2; privacy center | 10–14 | R3 |
| 9 | Calendar sync | 5–7 (+6–9 for Google) | R4 |
| 10 | Search, offline, performance, accessibility | 8–11 | R4 |
| 11 | Release hardening and pilot | 6–9 | R4 |
| | **Total** | **104–145** (+6–9) | |

That is roughly 5–7 months of full-time work for one person, and proportionally longer part-time.

**Releases**

| Release | Phases | What users notice |
|---|---|---|
| R1 "Nền tảng" | 0–2 | Same features, new navigation and look, code sign-in that works in the installed app, dark mode, quick add |
| R2 "Kết nối" | 3–5 | Better friends and groups, everything live, chat, live friend map |
| R3 "Kế hoạch" | 6–8 | New calendar, timetable, free-time finder, better meetups, tasks, habits and notes |
| R4 "Đồng bộ & hoàn thiện" | 9–11 | Calendar sync, search, offline, speed, pilot launch |

**Why this order.** The foundation comes first because it makes every later phase cheaper. Chat and the live map come next because you asked for them and they share the realtime platform. Calendar work follows because the timetable needs the new calendar engine. Planner polish is last because today's tasks and notes already work.

### Phase 0 — Baseline and safety net (2–3 days)

1. **Toolchain.** Make a Node ≥ 22.12 the default for this project and add `.nvmrc` (the system Node is 18.19.1; a Node 22.23.3 already sits under `~/.local/share/pi-node/`; CI uses Node 24). Get Docker access for the local Supabase stack, or create a separate staging Supabase project.
2. **Run and record every check.** Done on 2026-10-07: typecheck, unit tests, build, browser tests (section 1). Still open: a clean `npm ci` install, the preview-mode browser run, pgTAP and the two-real-user script (the last two need Docker).
3. **Land the uncommitted work** (with your go-ahead) on a branch as reviewable commits: modes + migrations 0011–0012 · ICS import · Today and tasks · map · tests and CI · docs. Push and get all three CI jobs green; the browser and database jobs have never run on GitHub.
4. **Cloud state** (with your approval): apply migrations 0013 and 0014 to the cloud project or to staging, and record the migration list.
5. **Docs.** This plan is saved as `docs/master-plan.md` (done). After approval: add a "superseded" note to the four older plan docs and start `docs/adr/` (architecture, PWA-only, realtime design).
6. **Baseline numbers.** Gzip sizes are in section 4.6 (done). Still open: Lighthouse (mobile) for Today and Calendar, and screenshots of every screen at 390 px and 1280 px.

**Exit:** a clean clone passes every check locally (Node ≥ 22.12) and in CI (Node 24); nothing is uncommitted; a disposable database is available.

**Status on 2026-10-07:** items 2, 3, 5 and the bundle part of 6 are done. The work is committed on the local branch `refactor/foundation` and not pushed, so CI has not run. Item 4 waits for your approval. Lighthouse and screenshots are not done. ADRs were not written; this plan records the same decisions.

### Phase 1 — Architecture foundation (8–12 days)

1. **Tooling**: Prettier (one format-only commit), ESLint, path aliases, a tsconfig for `e2e/` and `scripts/`, dependency-cruiser rules, TanStack Query, Testing Library.
2. **Kernel**: domain primitives, `UseCase`, `Container`, `Controller`, `EventBus`, typed Supabase client, `SupabaseRepository`, error mapper, in-memory helpers, `FeatureModule` and registry, formatters and message catalog — each with unit tests.
3. **Composition root** in `src/app/`: container, `SessionProvider` (keyed by user id, one query client per session), router built from the registry. Existing pages are mounted through a temporary `legacy` module, so nothing changes for users. `safeReturnPath` reads the registry.
4. **Pilot module `tasks`**: entity, repository interface, Supabase and in-memory repositories, use cases, view models. `TaskListCard` and the Home quick-add switch to it. The task tests in `AppData.test.ts` become use-case tests and a repository contract suite.
5. **Pilot module `notifications`**: entity, repository, handler registry for the 8 current categories, unread count, page rebuilt on view models.
6. **Generated database types** and the CI drift check.
7. **Migration `0015_security_hardening.sql`** with pgTAP (defects 1–5): `private` helpers; grants and `search_path` for all definer functions; `revoke_relationship_grants` inside `remove_friend` and `block_user`; `get_shared_busy` re-checks friendship and blocks; `start_location_session` and `invite_to_meetup` require an allowed contact (a friend, or a member of the same group for meetups); cleanup of positions of ended sessions; account-deletion preparation callable only from the Edge Function.
8. **Cleanup and docs**: remove dead `AppData` code (defect 17); rewrite `docs/architecture.md` to match reality; write `docs/module-guide.md`.

**Files.** New: `src/app/*`, `src/kernel/*`, `src/modules/tasks/*`, `src/modules/notifications/*`, `supabase/migrations/0015_security_hardening.sql`, `supabase/tests/database/security_hardening.test.sql`. Changed: `src/main.tsx`, `src/App.tsx`, `src/bootstrap/AuthenticatedApp.tsx`, `src/shared/infrastructure/AppData.ts`, `src/features/home/presentation/HomePage.tsx`, `src/features/personal/presentation/TaskListCard.tsx`, `src/features/notifications/*`, `package.json`, `tsconfig.json`, `vite.config.ts`, `.github/workflows/ci.yml`.

**Exit:** tasks and notifications run end to end through domain → use case → repository; the architecture lint passes in CI; the hardening tests pass on a local database; all earlier unit and browser tests still pass; a dummy module can be added by touching only `app/modules.ts`.

**Status on 2026-10-07:** done with the differences listed in section 3.13. Checks: typecheck, 57 unit tests, 16 browser tests, production build, and 63 database assertions on the embedded Postgres all pass. Not done: generated database types (needs a running database), a run of the pgTAP files on a real Supabase stack, and moving account-deletion preparation behind the Edge Function. The bottom tabs are still a fixed list in `AppShell.tsx` until Phase 2.

### Phase 2 — Design system, adaptive shell, sign-in, PWA basics (10–14 days)

1. Tokens, theme switch, type scale, safe areas (defect 12).
2. Primitives and patterns in `kernel/ui`; the `/dev/ui` gallery; the four `window.confirm` calls replaced.
3. Shell built from the registry: top bar, bottom tabs, navigation rail, sidebar, quick add, bell with badge, offline banner, update prompt (defect 14), shell indicators.
4. New route map with redirects from every old route.
5. `today` module: widget dashboard. The tasks widget comes from the new module; calendar, meetups and friends widgets use thin adapters over the legacy data classes until those modules move.
6. Sign-in with a 6-digit code (defect 13). This needs the email template changed in Supabase (your action). Onboarding wizard v1.
7. PWA: PNG icons, Apple touch icon, manifest shortcuts, install hint, app badge.
8. Tests: component tests for primitives (focus, keyboard), visual snapshots at 320 / 390 / 768 / 1280 px, axe checks.

**Exit:** every existing feature is reachable within two taps on a phone; no horizontal scrolling at any of the four widths; an installed PWA on iOS and on Android can sign in; both themes are consistent.

### Phase 3 — Friends, groups, realtime platform, notification pipeline (12–16 days)

1. Modules **`friends`** and **`groups`**: entities and state machines, repositories over the existing SQL functions, use cases, redesigned pages, friend profile, group hub skeleton. Fixes defects 10 and 11.
2. PeoplePicker and AudiencePicker, then used everywhere a username is typed today.
3. Friends v2 (`0017_friends_v2.sql`): invite links and QR, search, friend lists, nicknames, blocked-users screen, birthdays.
4. Groups v2 (`0018_groups_v2.sql`): invite management, roles, `member_count` trigger, group picture (storage bucket and policies), group availability toggle.
5. Realtime platform (`0019_realtime_user_topics.sql`): topic policy, `private.emit`, `RealtimeGateway`, provider, reconnect catch-up, polling fallback.
6. Notification pipeline (`0020_notifications_pipeline.sql`): `entity_type`, `entity_id`, `actor_id`; `private.notify`; push queue and Edge Function `notify-dispatch`; inline actions; mark all read; cleanup job (defect 8).
7. Module **`identity`**: profile editing (picture, username rules, birthday, time-zone select) and the settings skeleton.

**Exit:** two test users connect through an invite link; the other device shows a badge and a toast in about 2 s without reloading; a push arrives for a friend request on staging; the unfriend / block matrix passes pgTAP and a two-browser test.

### Phase 4 — Chat (9–12 days)

1. `0021_chat.sql` (tables, RLS, SQL functions, fan-out triggers, indexes) and `0022_chat_migrate_meetup_comments.sql` (copies comments into messages; the old functions stay as wrappers for one release).
2. Module **`chat`**: entities, `ChatConversationController`, repositories, use cases, realtime handlers.
3. UI: conversation list, thread, composer, reactions, replies, two panes on desktop; entry points from the friend profile, the group hub and the meetup.
4. Push for messages: grouped per conversation, mute, hidden-preview option.
5. Photos if time allows: storage bucket, client-side resize, signed URLs.
6. Tests: pgTAP (member, non-member, removed, blocked, anonymous), controller unit tests (ordering, duplicates, retry), two-browser test.

**Exit:** the "done when" of feature B4.

### Phase 5 — Live friend map and status v2 (9–13 days)

1. `0023_live_location.sql` (session modes, pause state, watch leases, location requests, rate limit, fan-out triggers) and `0024_status_catalog.sql`.
2. Module **`location`**: `LocationPublisher` (grown from `LocationController`), `FriendLocationsController`, repositories, use cases, `GeolocationProvider` and `WakeLockProvider` ports.
3. UI: map page, avatar markers, smooth movement, share sheet, app-wide sharing indicator, Tàng hình, Hỏi vị trí, check-in, Today widget.
4. Module **`presence`**: catalog-driven status, custom status, audience, live updates, nudge.
5. Tests: the 9 existing controller tests plus new ones; pgTAP matrix (owner, recipient, ex-friend, blocked, stranger, anonymous; expiry; pause; cleanup); two-browser test with mocked GPS; an outdoor test on two real phones.

**Exit:** the "done when" of feature B5, including the real-phone test.

### Phase 6 — Calendar v2 (12–16 days)

1. Module **`calendar`**: move the engine into the domain, add `RecurrenceRule`, fix defect 7, keep the Los Angeles / Ho Chi Minh time-zone test runs; `CalendarSource` and `ListOccurrences`.
2. `0025_calendar_v2.sql` (new columns, `import_batches`) and `0026_busy_projection.sql` (`list_busy_projection`, defect 6).
3. UI: agenda / day / week / month, source filters, one event sheet, edit scopes, drag and drop with a keyboard alternative; the shared calendar moves inside the friend profile.
4. Event reminders: `0027_occurrence_window.sql`, Edge Function `materialize-occurrences` running the shared engine, `process-reminders` extended to event reminders.
5. `.ics` import v2 and export (defect 16).

**Exit:** the "done when" of feature A4.

### Phase 7 — Timetable, free-time finder, meetups v2 (13–18 days)

1. `0028_timetable.sql`; module **`timetable`**: domain, importers, calendar source, week grid, day swiper, class detail, exceptions, reminders, optional automatic status.
2. Module **`availability`**: `FreeSlotFinder`, heatmap and slot list, group availability, "propose these slots".
3. Module **`meetups`** with v2 (`0029_meetups_v2.sql`): detail route, wizard, participants, deadlines, place, templates, group auto-invite (defect 9), calendar source, chat thread, arrival sharing.

**Exit:** one scripted classmate journey passes in a two-browser test: both import timetables → the finder shows common free slots → A proposes three → B votes → A confirms → both calendars show it → reminder → arrival sharing → chat in the thread.

### Phase 8 — Planner v2 and privacy center (10–14 days)

1. Tasks v2 (`0030_tasks_v2.sql`, defect 15), habits (`0031_habits.sql`, expand step), notes v2 (`0032_notes_v2.sql`), shared group task lists (`0033_group_tasks.sql`), quick-add parser, reminders for tasks and habits.
2. Settings and privacy center (feature C4); notification settings redesigned.
3. Focus timer if time allows.

**Exit:** planner journeys pass on phone and desktop; the privacy center lists every active share of a seeded user, checked against the database.

### Phase 9 — Calendar sync (5–7 days, +6–9 for Google)

1. Feed out: `0034_calendar_feeds.sql`, Edge Function `calendar-feed`, UI with a clear warning and a revoke button.
2. Subscribe in: `0035_external_calendars.sql`, scheduled Edge Function `sync-external-calendars` (HTTPS only, private-network addresses blocked, size and time limits, conditional requests).
3. Google connection: go / no-go decision first.

**Exit:** Google Calendar subscribed to a Gnouht feed shows a repeating class correctly; a Google secret address subscribed into Gnouht appears read-only and counts as busy; a revoked feed link stops working.

### Phase 10 — Search, offline, performance, accessibility (8–11 days)

Global search and command palette · offline copy and queued quick-add (after the decision in C6) · performance work to meet the budgets (calendar grid only where needed, list virtualization, prefetch on intent) · accessibility pass in both themes with screen readers.

**Exit:** budgets met; axe clean on core flows; the manual screen-reader checklist is done.

### Phase 11 — Release hardening and pilot (6–9 days)

Staging acceptance with an updated `docs/deployment.md` checklist · custom SMTP for sign-in emails · VAPID keys and schedulers · realtime and database quota review · backup and restore drill · error monitoring without personal data · `min_client_version` gate · rollback steps · deploy to `gnouht.space` on Cloudflare · pilot with 5–10 classmates and a fix round.

**Exit:** your sign-off.

---

## 8. Verification

**Commands** (Node ≥ 22.12):

```bash
npm ci
npm run typecheck
npm test                              # unit tests and the architecture rules
npm run test:db                       # every migration + the pgTAP files on an embedded Postgres
npm run build
npm run test:e2e                      # Playwright against a mocked backend
npx supabase@2.119.0 start            # needs Docker
npx supabase@2.119.0 test db supabase/tests/database
node scripts/local-two-user-check.mjs # two real users on local Supabase; see the file for its environment variables
```

Planned and not built yet: an in-memory backend mode for the whole app, and the two-real-user script as a Playwright project.

| Layer | Tool | Proves |
|---|---|---|
| Domain | Vitest | Rules, state machines, recurrence, time zones (run under two `TZ` values) |
| Use cases | Vitest + in-memory repositories | Each user intention, including failures |
| Repository contract | Same suite against in-memory and local Supabase | The fake and the real adapter behave the same |
| Database | pgTAP | RLS and SQL functions for six roles: owner, recipient / member, ex-friend, blocked, stranger, anonymous |
| Components | Testing Library | Labels, focus, pending and error states, input kept on failure |
| Browser | Playwright (in-memory) | Journeys, four widths, visual snapshots, axe |
| Browser, real backend | Playwright with two signed-in contexts | Cross-user behavior and privacy through the real API |
| Real devices | Manual checklist | Install and code sign-in on iOS and Android, push, live location outdoors on two phones, chat keyboard and safe areas, VoiceOver / TalkBack |

A phase is done when its exit gate is met, CI is green, and `docs/implementation-progress.md` records the evidence. "Works on staging" or "works on a phone" is only written after it was actually run there.

---

## 9. Risks and decisions

| Risk | Handling |
|---|---|
| Live location needs the app open (PWA only) | Honest paused state, Wake Lock, "Hỏi vị trí"; the `GeolocationProvider` port keeps a native wrapper possible later |
| The refactor delays features | Strangler steps; every phase ships something visible; progress is measured by files left under `src/features` and `src/shared` |
| Old installed clients meet a new database | Expand → contract migrations, `min_client_version`, update prompt |
| Realtime and push usage or cost | Positions fan out only to people watching; adaptive GPS rate; quota review in Phase 11 |
| A new feature leaks private data | The six-role pgTAP matrix is part of every feature's "done" |
| Sign-in emails do not arrive (Supabase's built-in mailer is limited) | Custom SMTP before inviting classmates |
| Lint tooling may not support TypeScript 7 yet | Checked first in Phase 1; oxlint or Biome as fallback |
| Google verification | Feeds (C5 steps 1–2) carry most of the value; the Google connection is optional |
| Size of the plan | Four releases, marked stretch items, re-estimate every phase |
| This machine (default Node 18, no Docker access) | `.nvmrc` pins Node 22; `npm run test:db` covers the database without Docker. A real Supabase stack is still needed before anything is applied to the cloud project |

**Decisions needed from you later** (only the first two affect Phases 0–1):

1. Docker access on this machine, or a separate staging Supabase project? — Phase 0
2. Approval to apply migrations 0013–0016 to the cloud project — Phases 0–1
3. Email provider for sign-in codes — Phase 2
4. Final tab layout after trying the new shell — Phase 2
5. Allow "until I turn it off" location sharing? Proposed: yes, only to chosen friends, with a monthly reminder of who can see you — Phase 5
6. A sample timetable export from your school — Phase 7
7. Google account connection: go or no-go — Phase 9
8. Keep a local copy of your own planner data for offline use? — Phase 10

---

## 10. Next steps

**Done on 2026-10-07** (branch `refactor/foundation`, local commits, nothing pushed): phases 0 to 10 in a reduced form. `docs/implementation-progress.md` lists, phase by phase, what exists, what was left out and what was not verified.

**Waiting for you:**

1. Review the branch, then push it or tell me to open a pull request. CI has not run on any of this.
2. A real Supabase stack to run the pgTAP files and try realtime on: Docker access on this machine, or a separate staging project.
3. Approval to apply migrations 0013–0029 to the cloud project, in order. 0015 changes who can receive a location share and a meetup invitation, and deletes availability shares between people who are no longer friends. Until they are applied, the new features show errors against the cloud database.
4. In the Supabase dashboard: put the 6-digit code in the sign-in email template (`supabase/templates/magic_link.html` is the local copy), and check that Realtime accepts private channels.
5. Deploy the Edge Functions `calendar-feed` (new), `process-reminders` and `delete-account`, set `CRON_SECRET` and the VAPID keys, and schedule `process-reminders`. `docs/deployment.md` has the steps.

**Next in the plan:** the parts each phase left out, in the order that matters to your classmates, and Phase 11 (staging acceptance, real devices, the pilot). Decisions 4 to 8 in section 9 are still open.

---

## Sources checked while planning

- Supabase Realtime authorization (private channels, RLS on `realtime.messages`, `realtime.topic()`, permission caching): https://supabase.com/docs/guides/realtime/authorization
- Supabase Broadcast from the database (`realtime.send`, `realtime.broadcast_changes`): https://supabase.com/docs/guides/realtime/broadcast
- Supabase Postgres Changes (RLS is not applied to DELETE events; publication requirement): https://supabase.com/docs/guides/realtime/postgres-changes
- iOS PWA behavior for geolocation and Wake Lock: https://firt.dev/notes/pwa-ios/ · https://bugs.webkit.org/show_bug.cgi?id=254545 · https://progressier.com/pwa-capabilities/screen-wake-lock
- Google OAuth "Testing" status (100 test users, 7-day authorization expiry): https://support.google.com/cloud/answer/10311615
