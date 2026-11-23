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

Runtime dependencies are limited to React, React Router and Supabase JS. **Ask before
adding any other dependency**, runtime or dev.

## Environment

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only. Locally in `.env.local`
  (git-ignored; copy `.env.example`); in CI from repository secrets of the same names.
- The anon key is public by design. **Never use the service-role key in client code**, in
  env files, or in the workflow.

## Database conventions

- Schema changes are **Supabase CLI migrations** in `supabase/migrations`
  (`supabase migration new <name>`). Never edit the schema by hand in the dashboard
  without a matching migration.
- **RLS on every table**, with policies on `owner_id = auth.uid()`. Every table has an
  `owner_id uuid not null default auth.uid() references auth.users`.
- **Cost roll-ups live in SQL views** (item cost, expected profit, labour hours, stock
  value, dashboard figures), not in client code. Views use `security_invoker = true` so
  RLS applies.
- Money is `numeric(10,2)` in GBP; display with `en-GB` formatting.
- Photos (later) go in a private Storage bucket, scoped per owner.

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
