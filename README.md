# Compliance Advisory Copilot (CAC)

> **FreeCharge Hackathon** — *Categorisation of Risk Rating of Circulars, closure of action
> items, and RCM creation.*

**Stages 0–2 complete.** Infrastructure, the full data model, the **foundation layer**
(18 functions · 36 controls · 31 KCIs), **circular ingestion** (any PDF — typed, scanned or
hybrid — with OCR where needed and per-page character offsets), and **AI analysis**:
summary, impacted departments, risk rating and action items, produced as a DRAFT that a
human must approve. Verified citations are next.

> **[CLAUDE.md](CLAUDE.md) is the canonical brief** — the stage plan, the invariants, and
> the reasoning behind each choice. Read it first.

See also
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/DATA_MODEL.md](docs/DATA_MODEL.md) ·
[docs/ROADMAP.md](docs/ROADMAP.md).

## Stack

| | |
|---|---|
| Frontend | **React + Vite + TypeScript + Tailwind** (plain SPA, no SSR framework) |
| Backend | **Python 3.12 + FastAPI** (modular monolith) |
| Async worker | **ARQ** (Redis) — same codebase, separate process (scaffolded, no tasks yet) |
| DB | **PostgreSQL 16 + pgvector** |
| Storage | **MinIO** (S3-compatible) |
| Queue | **Redis** |

> Feature-specific libraries (LLM gateway, orchestration, PDF/OCR, embeddings) are
> intentionally **not** installed yet — add them when you build the feature that needs them.
> The LLM/embedding settings already exist in `.env.example`/`config.py` as placeholders so
> the provider-agnostic approach is ready to wire up later.

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
    │   │   ├── worker/       # ARQ queue + settings (no tasks yet)
    │   │   ├── api/router.py # empty /api/v1 aggregator — plug routers in here
    │   │   └── main.py       # FastAPI entrypoint (health + empty router)
    │   ├── alembic/          # migrations
    │   ├── scripts/
    │   │   ├── data/*.json   # foundation seed: functions, controls, kcis
    │   │   └── seed.py       # schema + demo users + foundation data
    │   └── tests/            # scaffold sanity test
    └── web/                  # React + Vite SPA
        └── src/
            ├── lib/api.ts    # typed API client
            ├── components/   # StatTile, RagBar, StatusChip
            ├── pages/Home.tsx# foundation dashboard (live DB data)
            └── App.tsx       # router shell
```

## First-time setup (one-time)

Prereqs: **Docker Desktop**, **Python 3.12+**, **Node 20+**. Do this **once**:

```powershell
# 0. env
Copy-Item .env.example .env

# 1. infra
docker compose up -d db redis minio minio-init

# 2. backend
cd apps\api
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e .
python -m scripts.seed              # creates schema + demo users

# 3. frontend
cd ..\web
Copy-Item .env.example .env
npm install
```

## Running the project day-to-day

Once set up, there are three things to run: **infra (Docker), the API, and the web app.**

### The one command

From the project root:

```powershell
.\dev.ps1
```

This starts the Docker infra, then opens the API and web app each in their own window.
Then open **http://localhost:3000**.

> First time only, if PowerShell blocks the script, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### Or manually (3 terminals)

```powershell
# Terminal 1 — infra (leave running)
docker compose up -d db redis minio minio-init

# Terminal 2 — API
cd apps\api
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
# (optional, once you add worker tasks, in its own terminal)
# arq app.worker.settings.WorkerSettings

# Terminal 3 — web
cd apps\web
npm run dev
```

- App → **http://localhost:3000** (landing page pings `/health` to confirm the wiring)
- API docs → **http://localhost:8000/docs**
- MinIO console → **http://localhost:9001** (`minioadmin` / `minioadmin`)

### Stopping

Close the API/web windows (Ctrl+C in each), then `docker compose stop` for infra.
Your data survives — next time just run `.\dev.ps1` again.

### What you do NOT repeat on a normal start

`python -m venv`, `pip install -e .`, `npm install`, and `python -m scripts.seed` are
one-time. Only re-run **seed** if you wipe the database (see below).

> **Docker data note:** `docker compose stop` keeps your DB data; `docker compose down -v`
> **deletes** it — after that you must run `python -m scripts.seed` again to recreate the
> schema + demo users.

### Seeding

```powershell
python -m scripts.seed            # create schema if absent, then upsert all seed data
python -m scripts.seed --reset    # DROP the schema and rebuild from scratch
```

Seed data lives in `apps/api/scripts/data/` — **edit the JSON, re-run seed**. Rows are
matched on their business code (`F01` / `C-001` / `K-001`), so re-running updates in place
instead of duplicating, and every foreign key is validated before anything is written.
Use `--reset` whenever a model changes shape (there are no Alembic migrations yet).

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
