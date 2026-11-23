# Kickoff prompt for Claude Code

Paste this as the first message in Claude Code, from the repo root.

---

Read `docs/spec.md` and the HTML mockups in `docs/designs/` (open them as visual reference; they are static).

Then:

1. Write a `CLAUDE.md` for this repo: stack (Vite + React + TypeScript, hash routing, Supabase JS client), conventions (Supabase CLI migrations in `supabase/migrations`, RLS on every table with `owner_id = auth.uid()`, cost roll-ups in SQL views, never use the service-role key in client code, env vars `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`), and the phase plan below.
2. Do **phase 1 only**, then stop for my review:
   - Scaffold Vite + React + TS, hash router, Supabase client from env vars.
   - Login screen (email + password), protected routes, sign out.
   - App shell matching the designs: bottom tab bar on mobile, side nav on desktop.
   - GitHub Actions workflow deploying to GitHub Pages, reading the two env vars from repo secrets; correct `base` in `vite.config.ts` for the repo name.
   - `.env.example`, `.gitignore` covering `.env.local`.

Phase plan (one branch/PR each):

1. Scaffold, auth, shell, deploy
2. Schema, RLS, cost views (migrations)
3. Categories, items with short IDs, purchases
4. Parts, services, work lines
5. Channels, listings, sales
6. Dashboard, to-find notes, overheads, settings
7. Listing text helper, responsive polish

Ask me before adding any dependency beyond React, React Router, Supabase JS and a CSS approach you propose.
