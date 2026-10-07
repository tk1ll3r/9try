# Architecture

The app is a React single-page PWA on Supabase: Auth, Postgres with row level security, SQL functions and Edge Functions. This file describes the code as it is today. The target for the whole app and the order of migration are in [master-plan.md](master-plan.md).

## Source layout

```
src/
  main.tsx, App.tsx     entry and public routes
  app/                  composition root: the module list and the signed-in routes
  kernel/               code every module may use: module contract, session, dates, errors
  modules/<name>/       features on the new structure (tasks, notifications)
  features/ shared/ bootstrap/
                        older code, moved into modules phase by phase
supabase/
  migrations/           schema, policies, SQL functions
  functions/            Edge Functions
  tests/database/       pgTAP tests
```

## Inside a module

| Folder | Holds | May import |
|---|---|---|
| `domain` | Entities with their rules, repository interfaces | shared domain code |
| `application` | A service class for what a person can do | `domain` |
| `infrastructure` | Supabase repositories, browser APIs | `domain`, `application` |
| `presentation` | React components and hooks | `domain`, `application`, `kernel`, shared UI |

`<name>.module.ts` states what the module adds to the app: its services and its routes. `index.ts` is the only file that other features import.

A service class exists when it holds a rule, such as validation or a time calculation. Where there is no rule to hold, screens use the repository interface directly, as the notifications module does.

`src/architecture.test.ts` checks these import rules on every file and runs with `npm test`. Three old imports in `shared/infrastructure/AppData.ts` are listed there as known debt, and that list may only shrink.

## How the app is put together

`src/app/modules.ts` lists every module in a `ModuleRegistry`. The router in `src/app/AuthenticatedApp.tsx` builds the signed-in routes from that list. `registry.safePath` decides which paths from outside the code are accepted: the page to open after sign-in and the links stored with notifications.

After sign-in the app renders `<SessionProvider key={user.id}>`. The provider holds each module's services, built on first use for that user, and a TanStack Query cache. Signing in as someone else remounts the tree with a new provider, so data loaded for the previous user cannot reach the screen.

Screens read with `useQuery` and write with `useMutation`. `src/modules/tasks/presentation/useTasks.ts` is the example to copy.

## Backend

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

Helper functions that the API must not expose live in the `private` schema. Since migration 0015 no function in `public` can be called by an anonymous visitor. A new function has to revoke `execute` from `public` and `anon` and grant it to `authenticated`; `security_hardening.test.sql` fails otherwise.

## Checks

| Command | What it covers |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests and the architecture rules |
| `npm run test:db` | Every migration plus the pgTAP files on an embedded Postgres, no Docker needed |
| `npm run test:e2e` | Browser tests against a mocked backend |
| `npx supabase test db supabase/tests/database` | The same pgTAP files on a real local Supabase stack |

`npm run test:db` uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron and pgTAP. The last command is the authority when the two disagree.
