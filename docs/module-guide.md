# Adding a module

`src/modules/habits` is a small, complete example: one entity with a rule, one repository, one screen. Read it next to this list. `src/modules/tasks` shows the same with a service class in between.

## Steps

1. Create `src/modules/<name>/` with only the layers the feature needs.
2. `domain/`: the data the feature works with and a repository interface. Put a rule in an entity class when there is one. No React, no Supabase.
3. `infrastructure/`: a class that implements the interface with Supabase. It receives the client and the user id in its constructor, so every query is scoped to that user in one place.
4. `application/`: a service class if there is a rule to hold between the screen and the repository. Skip it otherwise.
5. `presentation/`: screens call `useModule(<name>Module)`, read with `useQuery` and change data with `useAction`. Use the module's name as the first element of every query key.
6. `<name>.module.ts`: export a `FeatureModule`. `create` builds the services for one signed-in user. `routes` and `navigation` put the screen in the app. Load pages with `lazy()`.
7. Add the module to the list in `src/app/modules.ts`. This is the only edit outside the module folder.
8. `index.ts`: export what other modules may use. Leave the file out when nothing is shared.

## Optional contributions

| To do this | Add this to the module |
|---|---|
| Show a counter on the navigation icon | `badge` on the navigation entry |
| Show a banner on every screen | `indicator` |
| Show a card on Today | `today: { order, card }`. Return `null` from the card when there is nothing to show |
| Show numbers on the statistics screen | `stats: { order, card }`. The card gets `days`, the number of days to count, today included. `StatTile` and `BarChart` in `kernel/ui/Stat.tsx` draw them |
| Put timed items on the calendar and under "Sắp tới" | `agenda` |
| Move a friend up on the Mode screen, with a reason | `friendSignals`: return `{ userId, kind, strength, label, to }`. Give a new `kind` a weight in `FriendRanking` if 20 is not right |
| Put a screen under another menu entry instead of in the menu | `parent: "/path-of-the-parent"` on the navigation entry |
| List what the feature shares on the privacy screen, with a stop button | `privacy` |
| Give the feature a section on the settings screen | `settings` |
| Put a screen in the account menu in the top right corner | A navigation entry with `tab: "me"` |
| Ask before a step that cannot be undone | `const confirm = useConfirm()`, then `if (await confirm({ title, body, action })) …`. Do not use `window.confirm` |
| Make the feature's items findable in the global search | `searchItems` |
| Reload a screen when the server changes something | Emit an event named after the query key from a database trigger with `private.emit` |

## Text

Write the text in Vietnamese and pass it to `t()` from `kernel/i18n`: `t("Lưu")`, and with values `t("Đã thêm {0} lớp.", count)`. Then add its English to `src/kernel/locales/en.ts`. `npm test` fails until that is done, and also when Vietnamese text is left outside `t()`. Write whole sentences: a sentence glued together from pieces cannot be put in another word order. Format dates and numbers with `locale` from the same file.

## Tests

One test file per module covers the entity's rules and the repository's scoping. `src/modules/notes/notes.test.ts` shows the mock for the Supabase client. Add a browser test in `e2e/` for the main journey, including a phone-width check when the screen is new. `e2e/signedIn.ts` opens pages as a signed-in person; `e2e/calendar.spec.ts` shows a test that fixes the clock.

`src/architecture.test.ts` fails when a file breaks the layering rules in [architecture.md](architecture.md).

## Database changes

1. Add `supabase/migrations/NNNN_<what_changes>.sql`. An installed app can run an older build for days, so keep the previous client working: add first, remove one release later.
2. New functions use `security definer set search_path = ''`, revoke `execute` from `public` and `anon`, and grant it to `authenticated`. Helpers that the API must not expose go in the `private` schema.
3. Raise short error codes such as `routine not found`, and add their Vietnamese text to `src/kernel/errors.ts`.
4. Add a pgTAP file in `supabase/tests/database/` that checks the rule for the owner, a friend, an ex-friend, a blocked user, a stranger and an anonymous visitor where it applies.
5. Run `npm run test:db`, then `npx supabase migration up --local` and `npm run test:db:local` when the local stack is running.
