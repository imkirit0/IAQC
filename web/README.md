# RDS — Risk Detection System (Next.js + Supabase)

Internal Audit and Quality Control of Franchise Centres — demonstration application.

## Set up (about 5 minutes)

1. **Create the database schema.** In the Supabase Dashboard, open **SQL Editor**, paste the contents of
   `supabase/migrations/0001_rds_schema.sql`, and run it — then each later file in `supabase/migrations/` in order
   (or set `DIRECT_URL` in `.env.local` and run `npm run migrate`, which applies them all; every file is idempotent).
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
| Department In-Charges (Academics, Marketing) | `academics` · `marketing` | `Academics@Demo2026` · `Marketing@Demo2026` |

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

## Support requests

Area Coordinators and ASO Directors raise support requests (training, academic, PRO, marketing, materials, certification…) for one of their
centres — from **My support requests**, from a centre card, or straight after submitting a visit report (linked to that report).

- **IAQA Coordinator** (Support tab) reviews, assigns a department and optionally a named in-charge, and sets a *response* deadline and an optional
  *completion* deadline. Reassigning or changing deadlines requires a reason. When support is delivered, IAQA verifies it (switchable under Settings).
- **Department in-charges** (role `dept`, one department each; created under Users) see only their department's requests: accept, reject with a reason,
  ask for clarification, post progress, put on hold, and record the support actually delivered (training: topic, mode, participants, outcome).
- **CMD** sees every request, department performance and full histories, read-only.
- Workflow rules (who may do what from which status) live in `src/lib/support.ts` and are enforced in the `supportAction` server action.
  *Overdue* is a flag beside the status, derived from the deadlines. The masthead shows a count of requests waiting on the user.
- Every step writes a row to `support_events`; a trigger makes that history append-only, and another keeps the original request text unchangeable.

## Visit location

Submitting a visit report captures one GPS fix from the device (latitude, longitude, accuracy, fix time). The server accepts it only if it is
less than 10 minutes old. If location fails, the coordinator sees why and can retry, or (unless Settings require location) submit the report marked
*unverified* with a reason. Coordinates are never filled in from the centre's own location. If a centre has registered coordinates (Centres → Edit),
IAQA and CMD see the distance on the scorecard and a flag beyond the configured threshold. A flag means the visit needs review; it does not prove anything.

## Deploy

Push to GitHub and import into Vercel (or any Node host), then set the same three environment variables. Every route is per-user, so no extra caching config is needed.

## Limitations (prototype)

- Users are not forced to change temporary passwords at first sign-in (they can change them from the user menu).
- Visit-report drafts are kept in the device's browser storage until submitted.
- All centres, people and records are fictional. Checklist criteria are sample, configurable policy requirements.
- Notifications are in-app only (count on the Support tab and the request lists); there is no email or SMS.
- Support requests have no file attachments, and a requester's original text cannot be corrected (only answered through clarification).
- Times display in Asia/Kolkata.
