# Architecture

The app is a React single-page PWA on Supabase: Auth, Postgres with row level security, SQL functions, Realtime, Storage and Edge Functions. This file describes the code as it is today. The plan it came from, and what was built differently, is in [master-plan.md](master-plan.md).

## Source layout

```
src/
  main.tsx, App.tsx     entry and the public routes
  app/                  composition root: module list, signed-in routes, shell, search dialog;
                        landing/ is the page a visitor who is not signed in sees first
  kernel/               code every module may use
  modules/<name>/       one folder per feature
supabase/
  migrations/           schema, policies, SQL functions
  functions/            Edge Functions; _shared/ holds code the web app runs too
  tests/database/       pgTAP tests
e2e/                    browser tests on a mocked backend
scripts/                db-smoke.mjs runs the migrations and pgTAP files without Docker;
                        setup-push.mjs turns push on for the cloud project (docs/deployment.md);
                        local-push-check.mjs sends real pushes through the local stack;
                        build-map-style.mjs makes the two map styles in public/map from the color tokens;
                        build-og.mjs draws public/og.png, the picture of a shared link
```

There are 17 modules in the signed-in app. `today`, `tasks`, `meetups`, `stats` and `expenses` retain their routes and data but have no navigation entries, so they do not appear in the Menu or navigation bar. The other modules are `calendar`, `habits`, `notes`, `notifications`, `chat`, `friends`, `groups`, `presence`, `moments`, `location`, `identity` and `menu`.

## Kernel

| File | Holds |
|---|---|
| `module.ts` | The `FeatureModule` contract and the `ModuleRegistry` |
| `session.tsx` | Per-user services and query cache: `SessionProvider`, `useModule`, `useRegistry`, `useUserId`, `useSearchItems` |
| `auth.tsx` | The signed-in user; sign-in with Google (when the project offers it), by emailed link or 6-digit code; sign-out |
| `google.ts` | Sign-in with Google that returns straight to the app: the trip to Google, and the token it leaves in the address |
| `supabase.ts` | The Supabase client. Only `*.module.ts` files and the kernel import it |
| `realtime.tsx` | One private channel per user; an event reloads the queries named after it |
| `useAction.ts` | Runs one change at a time, reloads a group of queries, then runs the caller's follow-up, also when the reload took the asking part of the screen away |
| `navigation.ts` | From the modules' navigation entries: the five screens of a phone's bottom bar, and the Menu's directory by part of the app |
| `features.ts` | `useFeatures()`: what the server says this account may use beyond the common app (`my_features`). An entry with `feature` is shown only then |
| `errors.ts` | `DomainError`, and the Vietnamese text for error codes raised by SQL functions |
| `dates.ts`, `text.ts` | Date and date-time keys, a clock, and search that ignores Vietnamese marks |
| `theme.ts` | The look of the app: light, dark, or the device's own setting, kept on the device. `theme.look()` is the one that is on screen now |
| `image.ts` | `toJpeg(file, { maxSide, maxBytes })`: a photo redrawn smaller as a JPEG before it is uploaded. The redraw also leaves behind the place and the device a phone writes into a photo |
| `files.ts` | `SignedFiles`: uploads to a private Storage bucket, and hands out addresses that work for an hour, many in one request |
| `i18n.ts`, `locales/` | The language of the app: `t("…")` and one dictionary for each language besides Vietnamese |
| `install.ts` | The browser's offer to install the app, kept from page load |
| `useFlip.ts` | Lets the parts of a list glide to their new places when the list is reordered |
| `ui/` | `Button`, `Card`, `DialogPanel`, `Avatar` (a picture stored in the profile, or the first letter); `Popover` and `MoreMenu` (a "…" button for the actions a row needs less often); `ConfirmProvider` and `useConfirm` (the question before a step that cannot be undone); `ThemeSwitch`, `LanguageSwitch`; `StatTile` and `BarChart` for the statistics |

Motion lives in `src/styles.css`: two easing curves, a handful of keyframes and the classes built on them (`page-slot`, `pressable`, `glass`, `aurora`, `skeleton`, `mode-ring`, `animate-pop`, and for the landing page `animate-float` and `reveal`, whose lines draw themselves when a section scrolls into view). There is no animation library. One rule at the end of the file turns all of it off under `prefers-reduced-motion`, and the browser tests run with that setting.

The look is the `data-theme` attribute on `<html>`, `light` or `dark`. A line of script in `index.html` sets it before the first paint, from the choice kept on the device or else from the device's own setting; `kernel/theme.ts` keeps it current, also when the device changes while the app is open. The colors are CSS variables that the attribute switches, and Tailwind's `dark:` utilities follow the same attribute.

## The shell

`app/AppShell.tsx` builds the navigation from what the modules contribute. A phone's bottom bar has the five screens that say `primary`: Mode, Lịch, Trò chuyện, Bản đồ and the Menu. The Menu and desktop sidebar list top-level destinations; child screens such as Thói quen and Ghi chú stay in a tab strip under their parent. Notifications and profile/settings have fixed controls in the top bar rather than duplicate Menu entries. The account menu (`AccountMenu` of the identity module) shows who is signed in, switches the look and signs out.

## The page for visitors

Someone who is not signed in and opens the site in a browser gets `app/landing/LandingPage.tsx`, at whatever address brought them: what the app is, how a day with it goes, its screens, who sees what, and how to install it. It is its own chunk, 8 kB gzip, and its drawings are inline SVG and markup in the app's color variables (`landing/drawings.tsx`), so they follow the look and need no image file. Its sign-in buttons lead to `/login`, the sign-in screen, and hand on the address the page was shown at (router state, which a reload keeps), so that an invitation's link is still where the visitor lands after sign-in. The installed app and a failed return from a sign-in skip the page and show the sign-in screen at once, with the path kept to return to. `index.html` carries the description and the Open Graph tags a chat app reads when the address is shared.

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
| `navigation` | Entries in the Menu and the desktop sidebar, with an optional badge. `primary: 1…5` also puts an entry in a phone's bottom bar. `feature: "…"` shows it only to an account the server has given that capability. Mode is the first tab and the screen at `/`. An entry of the `inbox` tab is the bell and the entries of the `me` tab fill the account menu, both in the top right corner. An entry with `parent` leaves the menu and becomes a tab on its parent's screen |
| `indicator` | A banner on every screen, such as "Đang chia sẻ vị trí" |
| `privacy` | A section of the privacy screen: what the module shows to other people now, with a way to stop |
| `settings` | A section of the settings screen: what the module lets the person set up. Push notifications come from `notifications`; the user's data, sign-out and account deletion from `identity` |
| `searchItems(services)` | What the global search can find in this module |
| `today` | A card on the Today screen, with its position. A card with nothing to say renders nothing |
| `stats` | A card on the statistics screen, with its position. It gets the number of days to count |
| `agenda(services, from, to)` | Timed things the module puts on the calendar and under "Sắp tới", such as a confirmed meetup |
| `friendSignals(services, { userId, now })` | What the module knows about the user's friends right now: a meetup soon, unread messages, a live location. The Mode screen ranks friends by these |

Adding a feature is a new folder plus one line in `src/app/modules.ts`. The shell, the router, Today, the calendar, the statistics, the privacy screen, the settings screen and the search need no edit.

## Languages

The app is written in Vietnamese, and every text a person reads goes through `t("…")` from `kernel/i18n.ts`. The Vietnamese text is the key; `kernel/locales/en.ts` gives the English for it. A text with values has numbered places, `t("Xóa {0} khỏi nhóm?", name)`, which a translation may reorder; a translation written "one|many" is chosen by the first value. A text without a translation is shown as written.

The language is fixed for as long as a page lives. Choosing another one, in the account menu or on the sign-in screen, stores it on the device and loads the app again; `main.tsx` waits for the dictionary before it draws anything. This is why a file may call `t()` once, when it is loaded, for a list of labels. English is a separate file of about 20 kB (gzip) that a Vietnamese reader never downloads. Dates and numbers take `locale` from the same module (`vi-VN` or `en-GB`).

`src/i18n.test.ts` keeps this whole: it fails when a text passed to `t()` has no English, when the dictionary holds a text the app no longer says, and when Vietnamese text appears in the code outside `t()`. A browser test opens every screen in English and fails on any Vietnamese text of the app's own.

Not translated: what people write (names, events, messages), the sign-in email, and the installed app's name and shortcuts. Notifications are written by the database in Vietnamese. `supabase/functions/_shared/notificationTexts.ts` is the one table of their English; the inbox shows a notification through it in the reader's language, and the push worker writes each push through it in the language of the device it goes to. `src/app/notificationTexts.test.ts` keeps the table's activity names and shared texts the same as the app's own. Nothing checks that every text a migration writes is in the table: a new one needs its line added by hand, and is shown in Vietnamese until then.

## The calendar

The calendar is drawn by the app; there is no calendar library. `calendar/domain/calendarView.ts` holds the arithmetic, without React: the weeks of a month, the days an entry touches, the part of a day it takes, and the side-by-side placement of entries that overlap. `CalendarBoard` draws three views from it: the week as a strip with the chosen day's list, the month with that list beside it, and the week as an hour grid (`WeekGrid`). Days are local `YYYY-MM-DD` keys throughout.

Everything on a calendar is a `CalendarEntry` with a tone that picks its color: the user's own event, a class, a plan from another module (`agenda`), or a friend's busy time. The four colors are the `--tone-*` variables in `styles.css`, one set for each look. The user's calendar and a friend's shared calendar use the same board; the second passes no handlers, so nothing in it can be pressed.

`calendar/domain/ics.ts` reads an .ics file for the import. The whole file is parsed once; when that fails, each event is parsed by itself, so one unreadable event is left out with its line number and the rest arrive. A rule the app's own repeat model has (daily, weekly, monthly, every one of them) becomes one repeating event with its skipped and changed dates; any other rule becomes dated events from one month back to twelve ahead. `import_calendar_events` stores up to 1,000 of them in one call, all private, and leaves an event it already has as it is.

## Activities

The activities a person can show (Học bài, Cà phê, Đang rảnh…) are a list in `src/modules/presence/presentation/modes.ts`: key, name, icon, color, grouped as the picker shows them. Since migration 0029 the database stores any key of the right shape, so adding an activity is one line in that file. A key the running app does not know is shown as "Đang làm việc khác"; the raw key is never displayed.

## How the Mode screen orders friends

Modules report `FriendSignal`s; `FriendRanking` in `src/modules/presence/domain/` turns them into an order. Each kind of signal has a weight in one table (`defaultWeights`): meetup 100, invite 70, room 65, unread 60, free 55, location 50, chat 45, moment 45, mode 40, any other kind 20. A friend's score is the sum of weight × the strongest signal of each kind. Pinned friends come first, then score, then friends with a mode on, then name. The reasons are shown on the friend's card, so the order explains itself.

## Photos of the day

`moments` is the frame at the top of the Mode screen: a photo, a caption of 80 characters, the mode it was taken in, and who sees it (all friends or chosen ones). A photo lives 24 hours. `private.can_see_moment` is asked for the row and for the file on every read, so a photo ends at its 24th hour, and for an ex-friend or a blocked person at once, whether or not anything was cleaned up yet. A job deletes expired rows every 10 minutes, and the push worker removes their files (see Files).

## The map

The map is MapLibre with OpenFreeMap's tiles, fonts and sprites, and two styles of the app's own, `public/map/light.json` and `public/map/dark.json`. `scripts/build-map-style.mjs` makes them from OpenFreeMap's Positron style by giving each of its colors a color made of the tokens in `src/styles.css`; `npm test` fails when the files no longer match the tokens. `MapCanvas` takes the style of the look that is on screen and swaps it when the look changes, on the same map. `VITE_MAP_STYLE_URL`, when set at build time, replaces both.

A friend is a marker with their face, the ring of the mode they have on, and their name from zoom 14. A marker that gets a new position glides there in 600 ms. A press on a face opens a card that the page draws into MapLibre's popup: who, what they are doing, how far, and a link to write to them. Below 1280 px the map runs from the title to the bottom bar and the list of friends and the sharing form are a sheet over it with three heights (`MapSheet`), dragged by its head or stepped by the bar at its top.

## Sessions and data

The sign-in screen loads without the module list. After sign-in the app loads `app/SignedInApp.tsx`, which renders `<SessionProvider key={user.id}>`. The provider builds each module's services on first use and owns a TanStack Query cache. It ends the services a moment after it unmounts, because React's StrictMode unmounts and remounts once in development. Signing in as someone else remounts the tree with a new provider, so data loaded for the previous user cannot reach the screen.

Screens read with `useQuery` and change data with `useAction(rootKey)`, which ignores a second tap while the first change is running and reloads every query under `rootKey` afterwards. The first element of a query key is the module's name: `["tasks", ...]`, `["chat", ...]`.

A process that must outlive a screen is a class the module builds once for the session. There are two. `LocationController` keeps sending positions while the user moves between screens and stops when the session ends; screens read it with `useSyncExternalStore`. `OnlineHeartbeat` tells the server every 30 seconds that the app is on screen, and that it is going when the tab is hidden or closed; it sends nothing for a person who does not share their presence.

## Realtime and notifications

Each user listens to one private channel, `user:<id>`. Only database triggers write to it, through `private.emit(user_id, event, payload)`. Because the trigger picks the recipients when the event happens, unfriending or blocking takes effect on the next event.

Event names are the first element of query keys: `notifications`, `friends`, `groups`, `chat`, `location`, `presence`, `moments`, `calendar`, `expenses`, `features`. `RealtimeBridge` reloads the matching queries and reloads everything after a reconnect. Polling stays as a fallback: 60 s for the unread badge, 5 s for an open chat thread, 20 s for the chat list, 15 s for the map with people on it and 60 s with nobody. The Mode screen also reloads every 20 s. The map loads its list at most once every three seconds, however many position events arrive.

One more kind of channel exists: `chat:<conversation id>`, which an open thread joins to tell the others in it that someone is typing. It is a broadcast between clients and nothing of it is stored. Two policies on `realtime.messages` let only a participant of that conversation listen and send. "Đã xem" does not use it: it is read from `conversation_reads` with the thread, and a thread marks itself as read only while its page is on screen.

Every row added to `notifications` also queues a row in `reminders`. The queue's rules are SQL: `claim_push_batch` hands out what is due and asks again, at that moment, whether the person still wants it (the category's choice, quiet hours, whether they may still see the thing); `finish_push` records what each device's push service answered, forgets a device that is gone, and retries a failure after 2, 4, 8 and 16 minutes before giving up. The `process-reminders` function only carries rows from one to the other and signs the pushes. The database wakes it through pg_net when a notification is written and once a minute; its address and secret are in Supabase Vault.

A personal reminder ("Nhắc việc") is a queue row with a time in the future. Since migration 0030 the database puts it into the inbox when it is due, once a minute through pg_cron, so it arrives where the worker is not deployed; the worker then only adds the push. Queue rows that nobody pushed are dropped after a week.

## Backend

Row level security and SQL functions decide what each user can read or change. Checks in the client only improve the experience.

- Changes go through `security definer` functions with an empty `search_path`. Each one revokes `execute` from `public` and `anon` and grants it to `authenticated`. `security_hardening.test.sql` fails when a function in `public` is callable by an anonymous visitor.
- Helpers that the API must not expose live in the `private` schema: `are_friends`, `is_blocked_between`, `can_contact`, `can_see_busy`, `emit`.
- A migration must keep the previous client working, because an installed app can run an old build for days. Add first, remove one release later.
- A feature for some accounts only is a row in `feature_grants`, by user id, which no client can write. `has_feature('…')` is asked by the policies and functions of that feature, and `my_features()` tells the app what to show. Creating an expense book is the first (`couple_expenses`).
- An expense book has members with a role: owner, editor or viewer. `private.book_role(book, user)` is the one place that answers it, and it answers nothing while the book's owner does not hold the capability. Every policy and function of the ledger asks it. `my_features()` says `expenses` to anyone who is in a book or invited to one, which is what shows them the ledger's screens. The table of who may do what is in [permission-matrix.md](permission-matrix.md).
- A room is a third kind of `conversations` row, tied to a meetup, an event or a mode. Who may be in it is read from that thing on every read and message; it closes by the clock and is deleted seven days later by a scheduled job.

Files: two private Storage buckets, made by migrations. `moments` holds the photos of the day (`<user id>/<photo id>.jpg`, JPEG, 512 kB at most) and `chat` the photos in messages (`<conversation id>/<message id>/<n>.jpg`, 410 kB at most). The policies on `storage.objects` let a person write under their own id or into a conversation they are in, and read a file only while the row that names it may be read. A file is removed through the Storage API, never by SQL, which would leave the stored bytes behind: the app removes it when a photo or a message is taken back, and the push worker removes what has no row any more (`orphan_media_files`, files older than an hour). A signed address lasts a week and is kept on the device, in memory and in localStorage, and is signed again a few minutes before it stops. The service worker caches the Storage response (`gnouht-photos-v1`, CacheFirst, ignoreSearch) so a later view of the same file on this device does not download it again.

Edge Functions:

| Function | Called by | Checks |
|---|---|---|
| `process-reminders` | The database (pg_net), when a notification is written and once a minute. Before the pushes it removes stored files that have no row any more, also where push has no keys | `CRON_SECRET` |
| `send-test-push` | The signed-in user, from the settings screen | The user's token; it reaches that user's devices only |
| `delete-account` | The signed-in user. It removes the person's photo files before the account | The user's token |
| `calendar-feed` | Other calendar apps | The token in the address, stored as a SHA-256 hash |

`supabase/functions/_shared/ics.ts` writes iCalendar text. It has no imports, so the web app's "Xuất lịch .ics" and the `calendar-feed` function run the same file. `_shared/notificationTexts.ts` is shared the same way.

## Checks

| Command | What it covers |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm test` | That the map styles match the color tokens, then unit tests, the architecture rules, and the `calendar-feed` handler on Node |
| `npm run test:db` | Every migration plus the pgTAP files on an embedded Postgres, no Docker needed |
| `npm run test:e2e` | Browser tests against a mocked backend |
| `npm run test:db:local` | The same pgTAP files on the local Supabase stack's Postgres, with the real pgTAP. No Docker access needed |
| `DENO=… npm run test:push:local` | Real pushes: the production build in a browser signed up with a real push service, the local stack's database, vault and pg_net, and the two push functions on Deno. Exit code 2 means the push service did not deliver to the test browser and nothing was checked |

`npm run test:db` uses stand-ins for the Supabase roles, `auth.uid()`, pg_cron, Realtime, Storage and pgTAP. `npm run test:db:local` has none of them: it is the authority when the two disagree. It needs the migrations applied to the local stack first (`npx supabase migration up --local`) and refuses any host but localhost. The embedded run passes as of migration 0044. On the local stack of this machine the Realtime service has been down since 2026-10-09, and every assertion that counts realtime events fails there for that reason alone; the progress log lists them.
