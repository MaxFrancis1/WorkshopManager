# Workshop Manager

Single-user web app to buy, work on and sell stock (first use: golf clubs), with cost per
item and a profit calculator. The full spec is in `docs/spec.md`; static HTML mockups are
in `docs/designs/` and are the visual reference for every screen.

This is a standalone Supabase app, not a Launchpad Consumer.

## Stack

- **Vite + React + TypeScript** (strict). `npm run dev`, `npm run build`, `npm run typecheck`.
- **Hash routing** (`createHashRouter` from `react-router`). GitHub Pages 404s on deep
  links, so every route lives after the `#`. Never switch to browser history routing.
- **Supabase JS client** (`src/lib/supabase.ts`), created from env vars. Auth is email +
  password, one user, sign-ups disabled in the Supabase project.
- **Styling:** plain CSS. Design tokens and shared primitives (`.card`, `.btn`, `.input`,
  `.tag-id`, …) are custom properties and classes in `src/styles/global.css`; component
  styles are CSS Modules (`*.module.css`) next to the component. No CSS framework.
  Fonts: Inter (body), Space Grotesk (headings, figures), JetBrains Mono (short IDs).
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml` on push to `main`.
  `base` in `vite.config.ts` is `/WorkshopManager/`; the workflow overrides it from the
  repository name via `BASE_PATH`.

## Dependencies

Runtime dependencies are limited to React, React Router and Supabase JS. Dev
dependencies: Vite, its React plugin, TypeScript, type packages and
`@electric-sql/pglite` (database tests). **Ask before adding any other dependency**,
runtime or dev.

## Environment

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. Locally in `.env.local`
  (git-ignored; copy `.env.example`); in CI from repository secrets of the same names.
- The anon key is public by design. **Never use the service-role key in client code**, in
  env files, or in the workflow.

## Database conventions

- Schema changes are **Supabase migrations** in `supabase/migrations`, named
  `YYYYMMDDHHMMSS_description.sql`. Never change a migration that has been merged to
  `main`: add a new one. Never edit the schema by hand in the dashboard.
- Deployment: the Supabase GitHub integration applies new migrations when `main`
  changes. Setup steps are in `docs/setup.md`.
- **RLS on every table**, with policy `owner_all` on `owner_id = (select auth.uid())`,
  `for all to authenticated`. Every table has an
  `owner_id uuid not null default auth.uid() references auth.users on delete cascade`,
  junction tables included.
- No anonymous access: revoke from `anon` on every new table, view and function.
  Grant tables to `authenticated`; views get `select` only.
- **Cost roll-ups live in SQL views**, not client code: `item_costs`,
  `purchase_allocations`, `sale_profits`, `job_totals`, `part_stock` (dashboard views
  come in phase 6). Views use `with (security_invoker = true)` so RLS applies.
- Functions: `set search_path = ''`, fully qualified names, security invoker. Stock
  movement, part-cost snapshots, work-line defaults and short IDs are triggers; the
  client just inserts rows.
- Money is `numeric(10,2)` GBP; part unit costs `numeric(12,4)`. Display with `en-GB`.
- Status columns are `text` plus a check constraint, not Postgres enums.
- Photos (later) go in a private Storage bucket, scoped per owner.

## Testing

- `npm run test:db` applies every migration to an in-memory Postgres (PGlite, dev
  dependency) with a stand-in for Supabase's auth schema
  (`supabase/tests/support/supabase-stub.sql`), then runs `supabase/tests/*.test.ts`
  with `node --test`.
- Guard tests fail if any public table lacks RLS or the owner policy, any `owner_id` is
  missing or nullable, or any view is not `security_invoker`. Add tests for every new
  trigger or view.
- CI (`.github/workflows/ci.yml`) runs build and `test:db` on every pull request.
- `npm run build` typechecks the app and the tests.

## App structure

- All Supabase calls live in `src/lib/api.ts`; each throws on error. Pages load data
  with `useAsync` (`src/lib/useAsync.ts`) and call `reload()` after a save.
- Row types for tables and views are hand-written in `src/lib/types.ts`; keep them in
  step with migrations.
- Multi-row writes that must succeed together go through a SQL function called with
  `rpc()` (e.g. `log_purchase`), not several client inserts.
- Money: `format.ts` has `money()` for display and `parseMoney()` for inputs (blank →
  null, invalid → NaN). `costSplit.ts` previews purchase splits; saved figures always
  come from the SQL views.
- Shared classes (`.list-row`, `.chip`, `.badge-*`, `.kv`, `.form-grid`, `.fab`,
  `.desktop-only`, `.mobile-only`) are in `global.css`. The visibility utilities only
  hide; they never set `display`.

## UI conventions

- Mobile first. Bottom tab bar (Dashboard, Items, Jobs, Parts, More) below 768px; side nav
  from 768px. Nav entries are defined once in `src/layout/nav.ts`.
- Touch targets at least 44px. Inputs use 16px text so iOS does not zoom.
- The item short ID is shown on every screen that names an item (`.tag-id`).
- UK English in all copy.

## Phase plan

One branch and PR per phase. Stop for review after each.

1. Scaffold, auth, shell, deploy
2. Schema, RLS, cost views (migrations)
3. Categories, items with short IDs, purchases
4. Parts, services, work lines
5. Channels, listings, sales
6. Dashboard, to-find notes, overheads, settings
7. Listing text helper, responsive polish
