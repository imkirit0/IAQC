# RDS — Risk Detection System (Next.js + Supabase)

Internal Audit and Quality Control of Franchise Centres — demonstration application.

## Set up (about 5 minutes)

1. **Create the database schema.** In the Supabase Dashboard, open **SQL Editor**, paste the contents of
   `supabase/migrations/0001_rds_schema.sql`, and run it.
2. **Add your keys.** Copy `.env.example` to `.env.local` and fill in the values from
   **Project Settings → API Keys**:
   - `NEXT_PUBLIC_SUPABASE_URL` — the project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the publishable key (or the legacy `anon` key)
   - `SUPABASE_SECRET_KEY` — the secret key (or the legacy `service_role` key). Server-only; never commit it.
3. **Load the demo data and check it:**
   ```
   npm install
   npm run seed        # add -- --reset to wipe and reload demo data
   npm run import-centres -- --apply   # load the real centre list (supabase/centres.json) and remove demo centres; re-runnable
   npm run verify      # RLS lockdown, reference scores, immutability
   ```
4. **Run:** `npm run dev`, then open http://localhost:3000.

## Demo accounts (DEMO DATA only)

| Role | Username | Password |
|---|---|---|
| IAQC Coordinator | `iaqc` | `Iaqc@Demo2026` |
| CMD (read-only) | `cmd` | `Cmd@Demo2026` |
| ASO Director, Malappuram (read-only, MLP centres only) | `aso` | `Aso@Demo2026` |
| Area Coordinators | `arjun.ac` · `priya.ac` · `rahul.ac` | `Arjun@Demo2026` · `Priya@Demo2026` · `Rahul@Demo2026` |

Usernames map to Supabase Auth users `<username>@rds.local`.

## How it is built

- **Next.js 16 App Router** with Cache Components: each page's shell is prerendered and per-user data streams in behind skeletons.
- **Security:** RLS is enabled on every table with *no* policies, so the browser key can only sign in. All reads and writes run in
  server components and server actions using the secret key, after `requireRole` / `guard` checks (`src/lib/auth.ts`).
  Deactivated users lose access on their next request. Logins, refusals and admin changes go to `audit_log`.
- **Scoring** (`src/lib/scoring.ts`) is a pure function of a report's stored snapshot (checklist + rules at submission time), so later checklist
  changes never alter past scores. A database trigger makes submitted assessments immutable. `npm run check` runs the engine's self-check.
- **Design:** "Audit report" system — paper and ink, Newsreader + Public Sans, hairline rules, light / dark / auto themes (`src/app/globals.css`).
- **Motion** (`motion` package): page transitions, shared-layout nav and answer highlights, animated sorting and filtering, count-up figures,
  drawn trend lines, spring dialogs and toasts, a theme cross-fade. All respect the OS "reduce motion" setting.

## Deploy

Push to GitHub and import into Vercel (or any Node host), then set the same three environment variables. Every route is per-user, so no extra caching config is needed.

## Limitations (prototype)

- Users are not forced to change temporary passwords at first sign-in (they can change them from the user menu).
- Visit-report drafts are kept in the device's browser storage until submitted.
- All centres, people and records are fictional. Checklist criteria are sample, configurable policy requirements.
