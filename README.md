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

## Quick start (Windows / PowerShell)

Prereqs: **Docker Desktop**, **Python 3.12+**, **Node 20+**.

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

uvicorn app.main:app --reload       # API at http://localhost:8000  (docs at /docs)
# (optional, in another terminal, once you add worker tasks)
# arq app.worker.settings.WorkerSettings

# 3. frontend (another terminal)
cd apps\web
Copy-Item .env.example .env
npm install
npm run dev                         # http://localhost:3000
```

Open **http://localhost:3000** — the landing page pings the backend `/health` to confirm
everything is wired. That's the whole scaffold; build features from here.

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
