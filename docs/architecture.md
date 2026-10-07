# Architecture

The app is a React single-page PWA on Supabase: Auth, Postgres with row level security, SQL functions, Realtime and Edge Functions. This file describes the code as it is today. The plan it came from, and what was built differently, is in [master-plan.md](master-plan.md).

## Source layout

```
src/
  main.tsx, App.tsx     entry and the public routes
  app/                  composition root: module list, signed-in routes, shell, search dialog
  kernel/               code every module may use
  modules/<name>/       one folder per feature
supabase/
  migrations/           schema, policies, SQL functions
  functions/            Edge Functions; _shared/ holds code the web app runs too
  tests/database/       pgTAP tests
e2e/                    browser tests on a mocked backend
scripts/db-smoke.mjs    runs the migrations and pgTAP files without Docker
```

There are 13 modules: `today`, `calendar`, `tasks`, `habits`, `notes`, `notifications`, `chat`, `friends`, `groups`, `meetups`, `presence`, `location`, `identity`.

## Kernel

| File | Holds |
|---|---|
| `module.ts` | The `FeatureModule` contract and the `ModuleRegistry` |
| `session.tsx` | Per-user services and query cache: `SessionProvider`, `useModule`, `useRegistry`, `useUserId`, `useSearchItems` |
| `auth.tsx` | The signed-in user, and sign-in by emailed link or 6-digit code |
| `supabase.ts` | The Supabase client. Only `*.module.ts` files and the kernel import it |
| `realtime.tsx` | One private channel per user; an event reloads the queries named after it |
| `useAction.ts` | Runs one change at a time, then reloads a group of queries |
| `errors.ts` | `DomainError`, and the Vietnamese text for error codes raised by SQL functions |
| `dates.ts`, `text.ts` | Date keys, a clock, and search that ignores Vietnamese marks |
| `install.ts` | The browser's offer to install the app, kept from page load |
| `useFlip.ts` | Lets the parts of a list glide to their new places when the list is reordered |
| `ui/` | `Button`, `Card`, `DialogPanel`, `MoreMenu` (a "…" button for the actions a row needs less often) |

Motion lives in `src/styles.css`: two easing curves, a handful of keyframes and the classes built on them (`page-slot`, `pressable`, `glass`, `aurora`, `skeleton`, `mode-ring`, `animate-pop`). There is no animation library. One rule at the end of the file turns all of it off under `prefers-reduced-motion`, and the browser tests run with that setting.

## Inside a module

| Folder | Holds | Must not import |
|---|---|---|
| `domain` | Entity classes with their rules, repository interfaces | React, Supabase, the other layers |
| `application` | A service class, when there is a rule between the screen and the repository | React, Supabase, `infrastructure`, `presentation` |
| `infrastructure` | Classes that implement the repository interfaces with Supabase or browser APIs | `presentation` |
| `presentation` | React components and hooks | Supabase, `infrastructure` |

`<name>.module.ts` wires the module together. `index.ts` is the only file another module may import.

A class exists where there is a rule to hold: `Task` (due dates, overdue), `Habit` (periods and streaks), `Membership` (group roles), `Profile` (username rules), `MeetupPolicy` (who may do what in which status), `LocationController` (when to send a position). Where there is no rule, a screen calls the repository interface directly.

`src/architecture.test.ts` checks the import rules above on every file and runs with `npm test`.

## What a module contributes

A module is one object of type `FeatureModule`, listed in `src/app/modules.ts`. Every field is optional.

| Field | Effect |
|---|---|
| `create(session)` | Builds the module's services for one signed-in user. Screens get them with `useModule(module)` |
| `routes` | Signed-in pages. The same list decides which outside paths are accepted (`registry.safePath`) |
| `navigation` | Entries in the bottom tabs, the row of sub-screens on a phone and the desktop sidebar, with an optional badge. Mode is the first tab and the screen at `/`; the inbox and the profile sit in the phone's top bar. An entry with `parent` leaves the menu and becomes a tab on its parent's screen |
| `indicator` | A banner on every screen, such as "Đang chia sẻ vị trí" |
| `privacy` | A section of the privacy screen: what the module shows to other people now, with a way to stop |
| `searchItems(services)` | What the global search can find in this module |
| `today` | A card on the Today screen, with its position. A card with nothing to say renders nothing |
| `agenda(services, from, to)` | Timed things the module puts on the calendar and under "Sắp tới", such as a confirmed meetup |
| `friendSignals(services, { userId, now })` | What the module knows about the user's friends right now: a meetup soon, unread messages, a live location. The Mode screen ranks friends by these |

Adding a feature is a new folder plus one line in `src/app/modules.ts`. The shell, the router, Today, the calendar, the privacy screen and the search need no edit.

## Activities

The activities a person can show (Học bài, Cà phê, Đang rảnh…) are a list in `src/modules/presence/presentation/modes.ts`: key, name, icon, color, grouped as the picker shows them. Since migration 0029 the database stores any key of the right shape, so adding an activity is one line in that file. A key the running app does not know is shown as "Đang làm việc khác"; the raw key is never displayed.

## How the Mode screen orders friends

Modules report `FriendSignal`s; `FriendRanking` in `src/modules/presence/domain/` turns them into an order. Each kind of signal has a weight in one table (`defaultWeights`): meetup 100, invite 70, unread 60, free 55, location 50, chat 45, mode 40, any other kind 20. A friend's score is the sum of weight × the strongest signal of each kind. Pinned friends come first, then score, then friends with a mode on, then name. The reasons are shown on the friend's card, so the order explains itself.

## Sessions and data

The sign-in screen loads without the module list. After sign-in the app loads `app/SignedInApp.tsx`, which renders `<SessionProvider key={user.id}>`. The provider builds each module's services on first use and owns a TanStack Query cache. It ends the services a moment after it unmounts, because React's StrictMode unmounts and remounts once in development. Signing in as someone else remounts the tree with a new provider, so data loaded for the previous user cannot reach the screen.

Screens read with `useQuery` and change data with `useAction(rootKey)`, which ignores a second tap while the first change is running and reloads every query under `rootKey` afterwards. The first element of a query key is the module's name: `["tasks", ...]`, `["chat", ...]`.

A process that must outlive a screen is a class with `subscribe` and `getState`, read with `useSyncExternalStore`. `LocationController` is the only one: it keeps sending positions while the user moves between screens and stops when the session ends.

## Realtime and notifications

Each user listens to one private channel, `user:<id>`. Only database triggers write to it, through `private.emit(user_id, event, payload)`. Because the trigger picks the recipients when the event happens, unfriending or blocking takes effect on the next event.

Event names are the first element of query keys: `notifications`, `friends`, `groups`, `chat`, `location`, `presence`. `RealtimeBridge` reloads the matching queries and reloads everything after a reconnect. Polling stays as a fallback: 60 s for the unread badge, 5 s for an open chat thread, 20 s for the chat list, 15 s for the map. The Mode screen also reloads every 20 s.

Every row added to `notifications` also queues a row in `reminders`, which the `process-reminders` function turns into a Web Push. Quiet hours and per-category choices are applied there.

## Backend

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

- Changes go through `security definer` functions with an empty `search_path`. Each one revokes `execute` from `public` and `anon` and grants it to `authenticated`. `security_hardening.test.sql` fails when a function in `public` is callable by an anonymous visitor.
- Helpers that the API must not expose live in the `private` schema: `are_friends`, `is_blocked_between`, `can_contact`, `can_see_busy`, `emit`.
- A migration must keep the previous client working, because an installed app can run an old build for days. Add first, remove one release later.

Edge Functions:

| Function | Called by | Checks |
|---|---|---|
| `process-reminders` | A scheduler | `CRON_SECRET` |
| `delete-account` | The signed-in user | The user's token |
| `calendar-feed` | Other calendar apps | The token in the address, stored as a SHA-256 hash |

`supabase/functions/_shared/ics.ts` writes iCalendar text. It has no imports, so the web app's "Xuất lịch .ics" and the `calendar-feed` function run the same file.

## Checks

| Command | What it covers |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests, the architecture rules, and the `calendar-feed` handler on Node |
| `npm run test:db` | Every migration plus the pgTAP files on an embedded Postgres, no Docker needed |
| `npm run test:e2e` | Browser tests against a mocked backend |
| `npm run test:db:local` | The same pgTAP files on the local Supabase stack's Postgres, with the real pgTAP. No Docker access needed |

`npm run test:db` uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron, Realtime and pgTAP. `npm run test:db:local` has none of them: it is the authority when the two disagree. It needs the migrations applied to the local stack first (`npx supabase migration up --local`) and refuses any host but localhost. Both pass as of migration 0028.
