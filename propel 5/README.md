# PROPEL

Evidence-based internship readiness prototype. Includes the updated website, backend, tests, revised IDF and technology guide.

## Start

Install Python 3.10+ and Node.js 20.19+ (with npm). Extract the ZIP before starting.

- macOS: run `bash start.command` from this folder.
- Windows: run `start-windows.bat`.
- Open http://127.0.0.1:3000. The backend uses port 8000.
- Explore a sample without signing in, or create your own account using Sign In → Sign Up.
- Stop the terminal processes with Ctrl+C when finished.

## Manual setup

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/manage.py migrate
python backend/manage.py runserver 127.0.0.1:8000
```

In a second terminal:

```sh
cd frontend
npm ci
npm run dev
```

Windows activation: `.venv\Scripts\activate`. To create a staff assessor account, run `python backend/manage.py createsuperuser`, then open http://127.0.0.1:8000/admin/ . Add Evidence with kind `reviewed`, channel `reviewed`, a supported skill, value 0–1 and actual observation date. Never label an unreviewed record as reviewed.

## Using the new features

1. Select a role or a job listing. Review and save its target competencies.
2. Add dated evidence. Resume mentions, public repository signals and manual certificates remain unverified sources.
3. Examine competency scores and separate quality, freshness and consistency checks.
4. Take a knowledge check or obtain staff-reviewed evidence. The server computes assessment scores.
5. Follow the minimum-action or minimum-hours catalog plan. Recording completion does not award proficiency; submit new evidence.
6. Export the report as JSON. Sample data is explicitly marked and is never saved as your evidence.

Live job scraping is optional: install `backend/requirements-optional.txt` for python-jobspy. Naukri scraping can be blocked by the portal. Public GitHub and Codeforces imports require Internet access and may be rate limited. No live vacancy guarantee is made.

## Verification

```sh
python backend/manage.py test api
python backend/manage.py check
cd frontend
npm run build
```

The 30 automated tests cover calculation behavior, planner optimality against exhaustive examples, account isolation, validation, assessment scoring, replay rejection and file extraction. External-service imports use mocks in tests; they are not proof of live service availability.

## Important model limits

This is a functional prototype, not a hiring prediction. Weights and thresholds are experimental. Catalog gains of 0.80 and durations are planning assumptions, not measured outcomes. Exact optimality applies only to that catalog and coverage model. The checks are unsupervised. Public platform signals do not verify ownership. General NLP, OCR, proctoring, automatic hiring decisions and scheduled background monitoring are not included.

The original supplied private SQLite database is excluded. A fresh database is created by migrations. Production hosting requires a private DJANGO_SECRET_KEY, DJANGO_DEBUG=0, explicit DJANGO_ALLOWED_HOSTS, HTTPS, suitable storage, operational rate limiting and deployment configuration. This package is configured for local development.

## Rocket animation update
The silver-and-navy rocket starts separated. Seven modules attach progressively across the first 90% of page scroll, followed by ignition and liftoff. Scrolling upward reverses assembly. The model sits higher and left of center. Reduced-motion preferences keep it assembled.
