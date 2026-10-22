# RDS — Risk Detection System
Internal Audit and Quality Control of Franchise Centres — demonstration prototype.

## Run
```
pip install flask        # only dependency (already present in Anaconda)
python app.py            # creates rds.db with DEMO DATA on first run
```
Open http://127.0.0.1:5000

Reset demo data: `python seed.py --reset` (stop the server first).
Self-check (all 10 acceptance criteria + scoring safeguards): `python test_rds.py`

## Demo accounts (DEMO DATA only)
| Role | Username | Password |
|---|---|---|
| IAQC Coordinator | iaqc | Iaqc@Demo2026 |
| CMD (Super Admin, read-only) | cmd | Cmd@Demo2026 |
| Area Coordinator | arjun.ac / priya.ac / rahul.ac | Arjun@Demo2026 / Priya@Demo2026 / Rahul@Demo2026 |

## What it is
- Flask + SQLite backend (`app.py`), vanilla JS single-page frontend (`static/`). No build step.
- Server-side authentication (salted scrypt hashes, signed HttpOnly session cookie) and role checks on every API endpoint.
- Every submitted report stores a snapshot of the checklist and scoring rules in force, so later checklist changes never alter past scores. A DB trigger blocks updates to submitted assessments. IAQC verification notes are stored separately.
- Scoring engine: `compute()` in `app.py`. Its formula is shown on every scorecard.
- Audit log covers logins, failed logins, denied access and all admin changes.

## Limitations (prototype)
- Runs on Flask's development server with SQLite. For production, use a WSGI server (e.g. waitress/gunicorn) behind HTTPS and add login rate-limiting.
- Users are not forced to change temporary passwords at first login (they can change them from the sidebar).
- Visit-report drafts are saved in the device's browser storage until submitted.
- All centres, people and records are fictional. Checklist criteria are sample, configurable policy requirements and are not verified existing organisational rules.
