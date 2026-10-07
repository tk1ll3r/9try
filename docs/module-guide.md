# Adding or moving a module

`src/modules/tasks` is the reference. Read it next to this list.

## A new module

1. Create `src/modules/<name>/` with only the layers the feature needs.
2. `domain/`: an entity class that owns the feature's rules, and a repository interface. No React, no Supabase.
3. `infrastructure/`: a class that implements the interface with Supabase. It receives the client and the user id in its constructor, so every query is scoped to that user in one place.
4. `application/`: a service class if there is a rule to hold between the screen and the repository. Skip it otherwise.
5. `<name>.module.ts`: export a `FeatureModule` with `create` (builds the services for one signed-in user) and `routes`.
6. Add the module to the list in `src/app/modules.ts`. This is the only edit outside the module folder.
7. `presentation/`: hooks that call `useModule(<name>Module)` and wrap the calls in `useQuery` or `useMutation`, then the components.
8. `index.ts`: export what other features may use. Export a heavy component with `lazy()` so that screens which do not show it do not download it.

## Moving an old page

1. Build the module as above, reusing the old code where it already works.
2. Remove the page's route from `src/app/legacy.module.ts` and add it to the module.
3. Delete the methods you replaced from `src/shared/infrastructure/AppData.ts` and the old `*Data.ts` file.
4. Remove entries from `knownDebt` in `src/architecture.test.ts` that no longer apply.

## Tests

One test file per module covers the entity's rules and the repository's scoping; `src/modules/tasks/tasks.test.ts` shows the mock for the Supabase client. Add a browser test in `e2e/ui.spec.ts` for the main journey.

## Database changes

1. Add `supabase/migrations/NNNN_<module>_<change>.sql`. An installed app can run an older build for days, so keep the previous client working: add first, remove one release later.
2. New functions revoke `execute` from `public` and `anon` and grant it to `authenticated`. Helpers that the API must not expose go in the `private` schema.
3. Add a pgTAP file in `supabase/tests/database/` that checks the rule for the owner, a friend, an ex-friend, a blocked user, a stranger and an anonymous visitor where it applies.
4. Run `npm run test:db`.
