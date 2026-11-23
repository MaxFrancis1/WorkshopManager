# Setting up Supabase, GitHub and GitHub Pages

One-off setup. When it's done:

- every push to `main` deploys the app to GitHub Pages
- every migration merged to `main` is applied to the Supabase database
- every pull request runs the build and database tests

The order matters. **Connect Supabase to GitHub (step 6) before merging the phase 2
pull request (step 7)**, so that the merge is what creates the tables.

Throughout, `<owner>` is the GitHub account or organisation that will own the repo.

---

## 1. Create the Supabase project

1. In [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**.
2. Name it (e.g. `workshop-manager`) and pick a UK or EU region (London if offered).
3. Set a database password and save it in your password manager. You won't need it
   day to day, only for running the Supabase CLI by hand (see Troubleshooting).
4. Wait for the project to finish provisioning. **Don't create any tables**: the
   migrations do that, and tables made by hand can make them fail.

## 2. Lock down sign-in

1. Go to **Authentication → Sign In / Providers**. Leave **Email** enabled, and turn
   **off** "Allow new users to sign up".
2. Go to **Authentication → Users → Add user → Create new user**. Enter your email
   and a strong password, and tick **Auto Confirm User**. This is the only account
   the app will ever have.
3. Optional, for password-reset emails later: **Authentication → URL Configuration**,
   set **Site URL** to `https://<owner>.github.io/WorkshopManager/`.

## 3. Get the two values the app needs

From **Project Settings → API Keys** (the **Connect** button at the top of the
dashboard shows them too):

| Value | Looks like | Goes in |
|---|---|---|
| Project URL | `https://abcdefghijkl.supabase.co` | `VITE_SUPABASE_URL` |
| Publishable key | `sb_publishable_…` | `VITE_SUPABASE_ANON_KEY` |

The legacy `anon` key (a long string starting `eyJ`) also works. **Never use the
secret key (`sb_secret_…`) or the legacy `service_role` key anywhere in this app.**

To run the app locally, copy the template and fill in both values:

```powershell
Copy-Item .env.example .env.local
```

```powershell
npm run dev
```

The app opens at `http://localhost:5173/WorkshopManager/`, and you can sign in with
the user from step 2. Sign-in works before any tables exist.

## 4. Create the GitHub repo

1. Create a new repository named **`WorkshopManager`** under `<owner>`, with no
   README, `.gitignore` or licence. The local repo already has all of those.
2. Public or private: GitHub Pages on a **private** repo needs a paid GitHub plan
   (Pro, Team or Enterprise). On a free plan, make the repo public. That is safe:
   no secrets are in the code, the publishable key is meant to be public, and RLS
   means only your signed-in user can read or write data.
3. If you use a different repo name, the deploy workflow picks it up automatically,
   but update the default `base` in `vite.config.ts` so local dev matches.

## 5. Add secrets and turn on Pages

In the repo on GitHub:

1. **Settings → Secrets and variables → Actions → New repository secret**. Add
   both:
   - `VITE_SUPABASE_URL`: the Project URL
   - `VITE_SUPABASE_ANON_KEY`: the publishable key
2. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.

Then push `main`, which holds phase 1 only and no migrations:

```powershell
git remote add origin https://github.com/<owner>/WorkshopManager.git
```

```powershell
git push -u origin main
```

Under the repo's **Actions** tab, **Deploy to GitHub Pages** should go green in a
couple of minutes. The app is then at `https://<owner>.github.io/WorkshopManager/`.
Sign in to check it works.

## 6. Connect Supabase to the GitHub repo

1. In Supabase: **Project Settings → Integrations → GitHub Integration →
   Authorize GitHub**, then **Authorize Supabase** on the GitHub page that opens.
   If the repo belongs to an organisation, GitHub may ask an org owner to approve
   the Supabase app.
2. Back on **Integrations**, choose the `WorkshopManager` repository.
3. **Working directory**: enter **`.`** (a single dot). This is the folder that
   *contains* `supabase/`, which here is the repo root.
4. Turn **on** "Deploy to production". If you're asked for a production branch,
   enter `main`.
5. Leave "Automatic branching" **off**. Preview databases per pull request need a
   paid Supabase plan, and you don't need them for production deploys.
6. Click **Enable integration**.

From now on, when `main` changes, Supabase applies every migration file in
`supabase/migrations` that the database hasn't run yet. Auth settings in
`supabase/config.toml` are **not** pushed to the hosted project; they only affect
local development.

## 7. Push phase 2 and merge it

```powershell
git push -u origin phase-2-schema
```

1. On GitHub, open a pull request from `phase-2-schema` into `main`.
2. Wait for the **CI / checks** job to pass. It runs the build and the database
   tests.
3. Review it, then **merge**.

The merge triggers both deploys at once: GitHub Pages rebuilds the app, and
Supabase applies the three phase 2 migrations.

## 8. Check it worked

In Supabase:

- **Table Editor** lists 22 tables (`items`, `parts`, `sales`, …), each marked as
  RLS-enabled.
- **Database → Migrations** lists `core_schema`, `functions_triggers` and
  `cost_views`.
- **Advisors → Security Advisor** reports no errors. A warning about leaked-password
  protection is an Auth setting, not part of the schema.

The app itself looks the same until phase 3 adds screens that use the tables.

## 9. Recommended: block bad merges

In GitHub: **Settings → Branches → Add branch ruleset** (or **Add rule**) for
`main`, then turn on **Require status checks to pass before merging** and add:

- `checks` (this repo's CI)
- the Supabase check, once it has appeared on a pull request

A migration that fails the tests then can't be merged, and so can't be deployed.

---

## Troubleshooting

**Pages deploy fails with "Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY…"**
One of the secrets is missing or misnamed. Check step 5, then re-run the workflow
from the Actions tab.

**The site loads but sign-in says "Invalid login credentials"**
Check that the user from step 2 exists and is confirmed, and that the secrets point
at the right project.

**No tables after merging**
Check the Supabase check on the merge commit in GitHub (the ✓ or ✗ next to it),
and the integration's deployment status in the Supabase dashboard. Common causes:
the integration was connected after the merge (push any small commit to `main` to
trigger it), the Working directory isn't `.`, or tables were created by hand first.

**Applying migrations by hand instead**
This is a fallback only; it needs the database password from step 1 and asks before
installing the Supabase CLI:

```powershell
npx supabase login
```

```powershell
npx supabase link --project-ref <project-ref>
```

```powershell
npx supabase db push
```

`<project-ref>` is the `abcdefghijkl` part of the Project URL.
