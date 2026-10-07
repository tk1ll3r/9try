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
| `ui/` | `Button`, `Card`, `DialogPanel` |

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
| `navigation` | Entries in the bottom tabs, the row of sub-screens on a phone and the desktop sidebar, with an optional badge |
| `indicator` | A banner on every screen, such as "Đang chia sẻ vị trí" |
| `privacy` | A section of the privacy screen: what the module shows to other people now, with a way to stop |
| `searchItems(services)` | What the global search can find in this module |

Adding a feature is a new folder plus one line in `src/app/modules.ts`. The shell, the router, the privacy screen and the search need no edit.

## Sessions and data

The sign-in screen loads without the module list. After sign-in the app loads `app/SignedInApp.tsx`, which renders `<SessionProvider key={user.id}>`. The provider builds each module's services on first use and owns a TanStack Query cache. Signing in as someone else remounts the tree with a new provider, so data loaded for the previous user cannot reach the screen.

Screens read with `useQuery` and change data with `useAction(rootKey)`, which ignores a second tap while the first change is running and reloads every query under `rootKey` afterwards. The first element of a query key is the module's name: `["tasks", ...]`, `["chat", ...]`.

A process that must outlive a screen is a class with `subscribe` and `getState`, read with `useSyncExternalStore`. `LocationController` is the only one: it keeps sending positions while the user moves between screens and stops when the session ends.

## Realtime and notifications

Each user listens to one private channel, `user:<id>`. Only database triggers write to it, through `private.emit(user_id, event, payload)`. Because the trigger picks the recipients when the event happens, unfriending or blocking takes effect on the next event.

Event names are the first element of query keys: `notifications`, `friends`, `groups`, `chat`, `location`. `RealtimeBridge` reloads the matching queries and reloads everything after a reconnect. Polling stays as a fallback: 60 s for the unread badge, 5 s for an open chat thread, 20 s for the chat list, 15 s for the map. Friends' status modes have no event yet and reload every 60 s.

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
| `npx supabase test db supabase/tests/database` | The same pgTAP files on a real local Supabase stack |

`npm run test:db` uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron, Realtime and pgTAP. The last command is the authority when the two disagree, and it has not been run yet.
