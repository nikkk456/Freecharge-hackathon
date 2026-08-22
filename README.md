# Compliance Advisory Copilot (CAC)

> **FreeCharge Hackathon** — *Categorisation of Risk Rating of Circulars, closure of action
> items, and RCM creation.*

Upload a regulatory circular → the AI produces a **cited** analysis → a human reviews and
approves it → it becomes a Risk & Control Matrix and a tracked list of action items.

**Stages 0–5 complete.**

| | What works |
|---|---|
| **Ingestion** | Any PDF — typed, scanned or hybrid. Scanned pages are OCR'd locally, page by page |
| **AI analysis** | Summary, impacted departments, risk rating, action items — always a DRAFT |
| **Verified citations** | Every claim carries a quote **our code located** in the stored text. Click it, the line highlights |
| **Human review** | Sign in, edit anything, override the rating, approve. Published work is frozen |
| **RCM** | Each risk matched against the 36-control library; the ones with no control are flagged as **gaps** |
| **Audit** | Every AI suggestion and human decision, hash-chained and verifiable live |

Next: the action-item tracker (owners, due dates, reminders).

Sign in with `reviewer@cac.dev` / `reviewer123` — the login page lists all demo accounts.

> **[CLAUDE.md](CLAUDE.md) is the canonical brief** — the stage plan, the invariants that
> outrank everything, and the reasoning behind each choice. Read it before changing code.

See also
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_MODEL.md](docs/DATA_MODEL.md) ·
[docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind | Plain SPA, no SSR framework |
| Backend | Python 3.11+ / FastAPI, modular monolith | One language for CRUD, workflow and AI |
| Async worker | ARQ over Redis, same codebase | OCR and LLM calls are slow and retryable — they never block the API |
| DB | PostgreSQL 16 + pgvector | Relational integrity and vectors in one place |
| Storage | MinIO (S3-compatible) | Raw PDFs; swaps for real S3 by config alone |
| LLM | **LiteLLM → `gemini/gemini-3.7-flash`** | Free tier. Provider-agnostic: change `LLM_MODEL` + key, no code change |
| PDF text | **pdfplumber** (MIT) | PyMuPDF is AGPL-3.0 and needs a paid licence to ship in a bank |
| OCR | **RapidOCR** (pip-only), Tesseract preferred if installed | Runs **locally** — a regulatory document never leaves the environment |
| Auth | JWT + RBAC (analyst / reviewer / owner / admin) | An approval must be attributable to a person |

**Cost: nothing.** Gemini's free tier covers the whole demo; OCR and matching run locally.

> **The provider abstraction is the point.** The demo runs on Gemini, but the LLM layer is
> `app/ai/client.py` and nothing outside it knows the vendor. In production you point
> `LLM_MODEL` at the bank's approved or on-prem model and nothing else changes — because
> regulatory data cannot leave the approved environment.

## Repository layout

```
Hackathon/
├── docker-compose.yml        # Postgres+pgvector, Redis, MinIO
├── .env.example              # copy to .env
├── docs/                     # architecture, data model, roadmap (the design + plan)
├── infra/db/init/            # pgvector + pgcrypto extensions on first boot
└── apps/
    ├── api/                  # FastAPI monolith + ARQ worker
    │   ├── app/
    │   │   ├── core/         # config, security, logging, storage, deps  ← infra plumbing
    │   │   ├── db/           # async SQLAlchemy engine + base
    │   │   ├── models/       # ALL 13 ORM tables (the data model)        ← kept as design
    │   │   ├── modules/      # EMPTY — your feature modules go here
    │   │   ├── ai/           # LLM client (LiteLLM) · prompts · citation grounding
    │   │   ├── worker/       # ARQ queue, tasks (OCR, analysis, RCM), settings
    │   │   ├── api/router.py # /api/v1 aggregator — plug module routers in here
    │   │   └── main.py       # FastAPI entrypoint
    │   ├── alembic/          # migrations (unused — see "Database changes" below)
    │   ├── scripts/
    │   │   ├── data/*.json   # foundation seed: functions, controls, kcis
    │   │   └── seed.py       # schema + demo users + foundation data
    │   └── tests/            # 188 tests
    └── web/                  # React + Vite SPA
        └── src/
            ├── lib/          # api.ts (typed client) · auth.tsx · usePolling.ts
            ├── components/   # panels, chips, meters
            ├── pages/        # Login · Home · Circulars · CircularDetail · Audit
            └── App.tsx       # router shell + auth gate
```

## First-time setup

**Prerequisites**

| | Why | Check |
|---|---|---|
| **Docker Desktop** | Postgres + Redis + MinIO | `docker --version` |
| **Python 3.11+** | the API and worker | `python --version` |
| **Node 20+** | the web app | `node --version` |
| **Gemini API key** | the AI stages (free tier is enough) | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Everything else — including OCR — installs via pip. No Tesseract, poppler or system
libraries are required.

```powershell
# 1. Environment. `.env` is gitignored; `.env.example` is committed.
Copy-Item .env.example .env
#    Open .env and paste your key into the GEMINI_API_KEY= line.
#    NEVER put a real key in .env.example — that file is tracked by git.

# 2. Infrastructure (Postgres + pgvector, Redis, MinIO)
docker compose up -d db redis minio minio-init

# 3. Backend
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"             # ~2 min: includes OCR models and LiteLLM
python -m scripts.seed              # schema + demo users + 18/36/31 foundation rows

# 4. Frontend
cd ..\web
Copy-Item .env.example .env
npm install
```

**Verify the setup** before running anything:

```powershell
cd apps\api
python -m pytest                     # 196 passed — includes a check that every
                                     # imported package is declared in pyproject.toml
python -c "from app.core.config import settings; print('key set:', bool(settings.gemini_api_key))"
```

> `pip install -e ".[dev]"` installs **everything** the app needs, including the LLM
> gateway and the OCR models. If you ever see `No module named '<something>'`, that is a
> bug in `pyproject.toml`, not something to fix by hand with `pip install` — add it to the
> dependency list so the next clone works too. `tests/test_dependencies_declared.py`
> fails when an import is missing from that list.

<details>
<summary><b>Troubleshooting</b></summary>

| Symptom | Cause and fix |
|---|---|
| `connection refused` on port 5432 | Docker isn't up: `docker compose up -d db redis minio` |
| Tests skip with "no database" | Same — the DB-backed tests need Postgres running |
| `No module named 'litellm'` (or any package) | Dependencies are out of date or were never installed. Re-run `pip install -e ".[dev]"` **inside the activated venv**. If it still fails, the package is missing from `pyproject.toml` — add it there rather than installing it ad-hoc |
| `No API key for the configured model` | `GEMINI_API_KEY` is empty in `.env`, or the API was started before you set it. Restart the API |
| Works for you, fails for a colleague | Almost always a package installed locally but not declared. `python -m pytest tests/test_dependencies_declared.py` catches it |
| Upload sits at `PARSING` forever | The ARQ worker isn't running — see below |
| Analysis sits at `ANALYZING` forever | Same. The worker is a separate process and does **not** hot-reload |
| `503 high demand` from Gemini | Free-tier spike. The client retries and falls back automatically; nothing to do |
| `relation "..." does not exist` after a `git pull` | A model changed. Run `python -m scripts.seed --reset` |
| PowerShell won't run `dev.ps1` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (once) |

</details>

## Running it

Four processes: **Docker infra, the API, the ARQ worker, and the web app.**

```powershell
.\dev.ps1        # from the project root — opens all four
```

Then open **http://localhost:3000** and sign in as `reviewer@cac.dev` / `reviewer123`.

> **The worker is not optional.** It does OCR, AI analysis and RCM generation. Without it,
> a scanned upload sits at `PARSING` and an analysis sits at `ANALYZING` forever.
> It also does **not** hot-reload — restart it after changing any code it imports.

<details>
<summary>Or manually, in four terminals</summary>

```powershell
# 1 — infra (leave running)
docker compose up -d db redis minio minio-init

# 2 — API
cd apps\api; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload

# 3 — worker (OCR + AI jobs)
cd apps\api; .\.venv\Scripts\Activate.ps1; arq app.worker.settings.WorkerSettings

# 4 — web
cd apps\web; npm run dev
```

</details>

- App → **http://localhost:3000**
- API docs → **http://localhost:8000/docs** (click *Authorize* and log in to try secured routes)
- MinIO console → **http://localhost:9001** (`minioadmin` / `minioadmin`)

**Stopping:** Ctrl+C each window, then `docker compose stop`. Your data survives;
`docker compose down -v` deletes it and you must re-seed.

### Try the whole flow

1. **Circulars → drop a PDF.** Any RBI circular. Typed, scanned or a mix — scanned pages
   are OCR'd automatically.
2. **Open it → Analyse with AI.** ~20–60s. You get a summary, impacted departments, a risk
   rating and action items.
3. **Click any `page N` chip.** The exact sentence lights up in the circular text. That
   quote was located by our code, not asserted by the model.
4. **Override the risk rating, add a department, then Approve & publish.** Try it as
   `analyst@cac.dev` first — approving is refused with a 403.
5. **Risk & Control Matrix tab → Build the matrix.** Each risk is matched against the
   36-control library; the ones with no control behind them are flagged as **gaps**.
6. **Audit tab → Verify chain.** Every AI suggestion and human decision, hash-chained.

### Seeding and database changes

```powershell
python -m scripts.seed            # create schema if absent, then upsert seed data
python -m scripts.seed --reset    # DROP the schema and rebuild from scratch
```

Seed data lives in `apps/api/scripts/data/` — **edit the JSON, re-run seed**. Rows are
matched on their business code (`F01` / `C-001` / `K-001`), so re-running updates in place
instead of duplicating, and every foreign key is validated before anything is written.

> **There are no Alembic migrations.** The schema is created by `create_all` in `seed.py`.
> After any change to a model — including pulling one — run `--reset`. It drops the whole
> `public` schema, which also clears the Postgres ENUM types that `drop_all` leaves behind.
> This is a deliberate hackathon trade-off: it costs you a re-upload, and it saves
> maintaining migrations for a schema that is still moving.

### Tests

```powershell
cd apps\api
python -m pytest                          # 188 tests
python -m ruff check app tests scripts    # lint
cd ..\web; npm run build                  # strict typecheck + build
```

Tests that need Postgres skip cleanly without it. They also **append to the audit trail**
(the review functions commit, and an append-only log cannot be tidied up without breaking
what it protects) — run `python -m scripts.seed --reset` before a demo for a clean chain.

### Demo users (seeded, for when you build auth)

| email | password | role |
|---|---|---|
| admin@cac.dev | admin123 | admin |
| analyst@cac.dev | analyst123 | analyst |
| reviewer@cac.dev | reviewer123 | reviewer |
| owner@cac.dev | owner123 | owner |

## Current endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness check |
| GET | `/api/v1/library/stats` | counts + KCI RAG mix — proves API→DB→seed data is wired |
| GET | `/api/v1/library/functions` | the 18 impacted departments |
| GET | `/api/v1/library/controls` | the 36 controls, each with owner function + KCI |
| GET | `/api/v1/library/kcis` | the 31 indicators with target, current value, RAG status |
| POST | `/api/v1/circulars` | upload a PDF → stored in MinIO, text extracted, row created |
| GET | `/api/v1/circulars` | list uploaded circulars (no `raw_text`) |
| GET | `/api/v1/circulars/{id}` | full detail incl. `raw_text` + `page_map` |
| PATCH | `/api/v1/circulars/{id}` | human override of ref no / title / issued date |
| POST | `/api/v1/circulars/{id}/retry` | re-run extraction (e.g. after installing an OCR engine) |
| GET | `/api/v1/circulars/ocr-status` | is OCR usable right now, and with which engine |
| GET | `/api/v1/circulars/{id}/pdf` | redirect to a presigned URL for the original PDF |
| POST | `/api/v1/circulars/{id}/analyze` | queue an AI analysis (worker); falls back to inline |
| GET | `/api/v1/circulars/{id}/analysis` | latest analysis: summary, risk, functions, action items |
| GET | `/api/v1/llm/status` | is a model configured, and what the fallback chain is |
| POST | `/api/v1/auth/login` | sign in (JSON); `/auth/token` is the OAuth2 form for /docs |
| GET | `/api/v1/auth/me` | the signed-in user |
| PATCH | `/api/v1/analyses/{id}` | reviewer overrides summary / risk rating / reasoning |
| POST | `/api/v1/analyses/{id}/publish` | **approve the draft** — reviewer or owner only |
| POST/DELETE | `/api/v1/analyses/{id}/functions[/{code}]` | add or remove an impacted department |
| POST | `/api/v1/circulars/{id}/action-items` | add an action item the model missed |
| PATCH/DELETE | `/api/v1/action-items/{id}` | edit or remove an action item |
| GET | `/api/v1/audit` | the append-only trail, newest first |
| GET | `/api/v1/audit/verify` | recompute the hash chain and report any break |
| POST | `/api/v1/circulars/{id}/rcm` | build (or rebuild) the Risk & Control Matrix |
| GET | `/api/v1/circulars/{id}/rcm` | the matrix: risks, coverage, mapped controls + KCIs |
| POST | `/api/v1/circulars/{id}/rcm/rows` | add a risk the model missed |
| PATCH/DELETE | `/api/v1/rcm-rows/{id}` | edit or remove a matrix row |
| POST | `/api/v1/rcms/{id}/publish` | **approve the matrix** — reviewer or owner only |
| DELETE | `/api/v1/circulars/{id}` | remove the circular and its stored PDF |
| GET | `/docs` | interactive OpenAPI docs |

## Tests

```powershell
cd apps\api
pip install -e ".[dev]"
pytest
```

## How to add a feature (the intended workflow)

1. Create `app/modules/<feature>/` with `router.py`, `service.py`, `schemas.py`.
2. Include its router in `app/api/router.py`.
3. If it needs async/AI work, add a task in `app/worker/` and register it in
   `WorkerSettings.functions`.
4. Add a page under `apps/web/src/pages/` and a typed call in `apps/web/src/lib/api.ts`.
5. Generate a migration: `alembic revision --autogenerate -m "..."` → `alembic upgrade head`.
