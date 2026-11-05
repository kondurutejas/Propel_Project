# 🚀 PROPEL

**Turn your evidence into your next career move.**

PROPEL is an internship-readiness prototype that brings together skill evidence, confidence checks, job targets, and a learning plan. A silver-and-blue 3D rocket assembles as you scroll through the website.

Built with **JavaScript · Three.js · GSAP · Vite · Django REST Framework · SQLite**.

## What you can do

- **Set a destination:** choose a career role or use a job listing to define target competencies.
- **Build your evidence:** add dated declarations, projects, certificates, coursework, and resume evidence; import supported GitHub and Codeforces signals.
- **Understand your readiness:** view skill scores alongside evidence quality, freshness, and consistency checks.
- **Check your knowledge:** complete server-scored assessments or add staff-reviewed evidence through Django admin.
- **Plan your next steps:** compare a minimum-action plan with a minimum-hours plan from the learning catalog.
- **Explore jobs:** review listings and select a target; sample listings are marked when used.
- **Track and export:** save evidence to an account and export a JSON readiness report.
- **Try a sample:** explore a synthetic profile without creating an account.

## Run locally

Install **Python 3.10+**, **Node.js 20.19+ with npm**, and Git first. Run these commands in Terminal or your editor's integrated terminal.

### macOS / Linux

```bash
git clone https://github.com/kondurutejas/Propel_Project.git
cd "Propel_Project/propel 5"
bash start.command
```

### Windows (Command Prompt)

```bat
git clone https://github.com/kondurutejas/Propel_Project.git
cd "Propel_Project\propel 5"
start-windows.bat
```

Open **http://127.0.0.1:3000** in your browser. The backend runs at **http://127.0.0.1:8000**. The startup script installs dependencies and applies database migrations; the first launch requires internet access.

Already cloned the repository? Open a terminal inside its `propel 5` folder and run the appropriate startup script. Keep the terminal running while using the app. On Windows, stop both the frontend and the separate backend terminal when finished.

> The folder name contains a space: keep quotation marks around paths containing `propel 5`.

### First visit

1. Click **Explore a sample** to preview the readiness workflow.
2. Use **Sign In → Sign Up** to create a local account for your own evidence.
3. Choose a role, review its skill targets, and save them.
4. Add evidence and inspect the score and confidence checks.
5. Complete a knowledge check, review the suggested plan, and export your report.

For separate frontend/backend startup and staff assessor setup, see the [project setup guide](propel%205/README.md).

## How readiness is calculated

Each observation has a value, source weight, and observation date. Older evidence contributes less according to the skill's configured half-life:

```text
freshness factor = 2 ^ (−age in days / half-life in days)
skill score      = Σ(weight × freshness factor × evidence value) / Σ(weight)
target gap       = max(0, target score − skill score)
```

The denominator does not decay, so unchanged evidence loses score as it ages. Source weights are experimental policy choices. Self-reported claims receive less weight than assessments or reviewed evidence, and contradiction feedback can reduce the reliability of declarations and resume claims.

Three separate checks describe **quality**, **freshness**, and **consistency**. Meeting a target score alone does not resolve a competency if confidence checks fail. See the [calculation engine](propel%205/backend/api/engine.py) and [evidence service](propel%205/backend/api/service.py) for the implementation.

The planner searches a finite activity catalog. Its gains and durations are assumptions, and marking an activity complete does **not** automatically award proficiency: new evidence is needed.

## Project layout

```text
Propel_Project/
├── README.md
└── propel 5/
    ├── frontend/                 # Website, 3D scene, and API client
    │   ├── main.js
    │   ├── js/
    │   └── public/models/
    ├── backend/
    │   ├── api/                  # Evidence, jobs, assessments, planner, tests
    │   ├── propel_career/        # Django configuration
    │   └── manage.py
    ├── docs/                     # IDF and technology guide
    ├── start.command             # macOS / Linux launcher
    └── start-windows.bat          # Windows launcher
```

## Checks for contributors

After installing dependencies, activate the virtual environment from `propel 5`:

```bash
source .venv/bin/activate
python backend/manage.py check
python backend/manage.py test api
cd frontend
npm run build
```

On Windows, use `.venv\Scripts\activate` instead of `source .venv/bin/activate`.

Tests cover calculation behavior, planning, account isolation, validation, assessments, and file extraction. External-service tests use mocks, so they do not establish live availability.

## Optional integrations

- **Job scraping:** install `backend/requirements-optional.txt` into the virtual environment for the optional JobSpy integration. Job portals may block requests or return no results.
- **GitHub / Codeforces:** imports require internet access and depend on public service availability and rate limits. These signals do not verify account ownership.
- **Resumes:** text-based PDF, DOCX, and TXT extraction is supported; scanned images require OCR, which is not included.

## Documentation

- [Detailed setup and usage](propel%205/README.md)
- [Revised Invention Disclosure Form (.docx)](propel%205/docs/PROPEL_IDF_Revised.docx)
- [Technology and tools guide (.pdf)](propel%205/docs/PROPEL_Technologies_Updated.pdf)

## Prototype scope

PROPEL produces experimental evidence-based scores, not hiring predictions. Assessments are unsupervised, and learning-plan gains are not validated outcomes. General-purpose NLP, OCR, proctoring, and scheduled background monitoring are not included.

The launch scripts are for local development. Uploading this repository to GitHub does not host the application. A public deployment needs production configuration, a private Django secret key, disabled debug mode, explicit allowed hosts, HTTPS, persistent storage, and operational protections.

## Contributing

Open an issue describing a reproducible problem or a proposed improvement. For changes, include what changed and how you checked it. Keep credentials, local databases, virtual environments, and installed dependencies out of commits.
