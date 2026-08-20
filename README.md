# Compliance Advisory Copilot (CAC)

> **FreeCharge Hackathon** — *Categorisation of Risk Rating of Circulars, closure of action
> items, and RCM creation.*

**This repository is a project scaffold.** The structure, infrastructure, configuration,
and the full database data model are in place. **No features are implemented yet** — feature
logic will be added deliberately, when and how the team decides. See the design and plan in
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
    │   ├── scripts/seed.py   # creates schema + demo users (no feature data)
    │   └── tests/            # scaffold sanity test
    └── web/                  # React + Vite SPA (bare shell)
        └── src/
            ├── lib/api.ts    # generic API client (health check only)
            ├── pages/Home.tsx# placeholder landing page
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
| GET | `/docs` | interactive OpenAPI docs (empty until you add routers) |

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
