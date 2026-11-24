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
  `purchase_allocations`, `sale_profits`, `job_totals`, `part_stock`, and the dashboard
  views. Views use `with (security_invoker = true)` so RLS applies. Views with
  dependents can only gain columns at the end (`create or replace view`).
- When a column used by the live app is replaced, keep it working in the database PR
  (e.g. a transitional sync trigger) and drop it in the PR that ships the new screens.
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
- `npm run test:unit` runs `tests/unit/*.test.ts`: the pure calculators in `src/lib`
  (profit estimate, what-if, cost split, listing text). `npm test` runs both suites.
- CI (`.github/workflows/ci.yml`) runs build, unit and database tests on every pull
  request.
- `npm run build` typechecks the app and the tests.
- New migrations reach the hosted database only when merged to `main`, so a screen
  that needs a new function or view can't be tested locally before then. Ship the
  migration in its own PR first, then test the UI against live data with records
  named `TEST …` and delete them afterwards.

## App structure

- All Supabase calls live in `src/lib/api.ts`; each throws on error. Pages load data
  with `useAsync` (`src/lib/useAsync.ts`) and call `reload()` after a save.
- Row types for tables and views are hand-written in `src/lib/types.ts`; keep them in
  step with migrations.
- Multi-row writes that must succeed together go through a SQL function called with
  `rpc()`: `log_purchase`, `add_work_line`, `create_job`, `create_listing`,
  `withdraw_listing`, `record_sale`, `delete_sale`. Item and listing statuses are kept
  in step by those functions, so the UI never sets Listed or Sold by hand.
- Pages are lazy-loaded per route (`App.tsx`); React and Supabase are split into their
  own chunks (`vite.config.ts`).
- Calculator figures are estimates (`src/lib/profit.ts`); the dashboard and sale pages
  use actuals from `sale_profits` and the dashboard views.
- **Cost vs value.** Cost (`item_costs.total_cost`, "invested") is what's been spent;
  profit is always sale − cost. Value (`item_costs.sale_value`) is what the item should
  sell for: the asking price of a live single-item listing, else `items.expected_price`.
  The dashboard shows both (Stock value, Invested). On the item page, expected sale and
  margin % are linked (typing one fills the other) and the expected sale is saved as
  `expected_price` only after the user types it.
- Purchase sources are configured in Settings (`sources` table); purchases reference
  them by `source_id`.
- Pages remount when the path changes (`FreshPerPath` in `App.tsx`), so moving from
  one item to another never carries state across.
- The Stall (`/stall`) shows live listings as cards, one per item or lot.
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

All seven phases are built. Phases 4–7 shipped as a database PR followed by a UI PR.
Basic Jobs (kind, status, items, work lines, totals) were added alongside.

1. Scaffold, auth, shell, deploy
2. Schema, RLS, cost views (migrations)
3. Categories, items with short IDs, purchases
4. Parts, services, work lines
5. Channels, listings, sales
6. Dashboard, to-find notes, overheads, settings
7. Listing text helper, responsive polish

Still "Next" in the spec: split item, returns, write-off with loss logging, part
exchange, customers, PDF quotes and receipts, photos, CSV export.
