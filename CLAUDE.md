# CAC — Compliance Advisory Copilot

FreeCharge hackathon. **Categorisation of risk rating of circulars, closure of action items, and RCM creation.**

Upload a regulatory circular (RBI/SEBI) → AI produces a grounded, **cited** analysis → a
human reviews and approves it → it becomes a Risk & Control Matrix and a tracked list of
action items with owners and deadlines.

---

## 1. The rules that outrank everything else

These are not preferences. Breaking one silently breaks the product's whole claim.

1. **Citations are verified, never trusted.** Every AI claim carries the exact character
   span it came from, and code checks that span really exists in `circulars.raw_text`. An
   unverifiable citation is flagged, not shown as fact. This is the demo.
2. **`raw_text[char_start:char_end]` must equal that page's text — always.** Every offset
   in the system is an index into `raw_text`. Mutating `raw_text` after page spans are
   computed silently invalidates every stored citation. `assemble()` in
   `app/modules/circulars/parser.py` asserts this on every parse. Do not remove it.
3. **Human in the loop is enforced by the state machine, not by convention.** Nothing
   reaches `PUBLISHED`, no action item reaches `CLOSED`, without a human decision.
4. **The AI never blocks the human.** If the model is down, the UI says so and every
   action stays doable by hand. Slow work goes to the worker; the API stays responsive.
5. **Never auto-close, never auto-submit.** Closure needs a human plus evidence.
6. **Jobs are idempotent.** A retried job re-derives from stored source, never appends to
   half-finished state.

---

## 2. Stage plan

The user builds **one stage at a time and tests before moving on**. Do not run ahead into
the next stage. Ask questions *before* coding, not during.

| # | Stage | Status | Test that proves it |
|---|---|---|---|
| 0 | Empty stack stood up: DB, backend, webpage | ✅ done | Page loads showing live seeded data |
| 1 | Upload PDF → text extracted, stored, shown | ✅ done | Upload a circular, read its text on screen |
| 2 | AI analysis: summary, impacted function, risk rating, action items | ✅ done | Model output appears for an uploaded circular |
| 3 | **Verified citations** — every claim carries its exact source line | ▶ next | Click a claim → its source line highlights |
| 4 | Review screen — human edits and approves the draft | ⬜ | Change the risk rating, press Approve |
| 5 | RCM — match AI risks to the existing control library | ⬜ | A risk↔control table is produced |
| 6 | Tracker — action items with owner, due date, status, reminders | ⬜ | An item shows "in progress" |

### Stage 0 — Foundation ✅
Docker infra (Postgres+pgvector, Redis, MinIO), all 13 ORM tables, and the **foundation
layer**: 18 functions, 36 controls, 31 KCIs seeded from `apps/api/scripts/data/*.json`.
Controls carry an owner function and a KCI with a RAG status — so Stage 5 can say
*"covered by C-006, owned by Collections & Recovery, currently amber."*
Exposed at `/api/v1/library/*`, shown on the Foundation page.

### Stage 1 — Ingestion ✅
Upload any PDF → stored in MinIO → text extracted → `raw_text` + `page_map` saved.
- **Text layer vs OCR is decided per page.** Real filings are hybrid (typed body +
  scanned annexure). A whole-document decision would either skip OCR on scanned pages
  or waste minutes re-OCRing good ones.
- Typed PDFs finish inline in ~1s. Any page needing OCR sends the document to the ARQ
  worker (~4s/page); the UI polls. If Redis is unreachable the API runs OCR inline
  instead — slower, but the demo never dies.
- `ref_no` and `issued_date` are pulled out by **regex, not AI**. The model refines the
  title at Stage 2.

### Stage 2 — AI analysis ✅
An ARQ task calls Gemini and writes an `AIAnalysis` row with `status=DRAFT`: summary,
impacted functions (chosen from the 18 by code), risk rating + reasoning, confidence,
and action items with a proposed owning department. Never writes `PUBLISHED`.

Things that are easy to get wrong here, and how they are handled:
- **The model chain retries and falls back.** Free-tier Gemini really does return 503
  "high demand". `complete_json` retries each model with jittered backoff, then moves to
  the next in `LLM_FALLBACK_MODELS`. Observed live: 3.7-flash 503'd twice, 3.6-flash
  completed the job.
- **`LLM_TEMPERATURE=1.0`, deliberately.** Google warns that below 1.0, Gemini 3 models
  suffer "infinite loops, degraded reasoning performance, and failure on complex tasks".
  Determinism is not worth degraded reasoning; a human reviews every draft anyway.
- **Re-running replaces, never accumulates.** The model rewords the same obligation each
  run, so keying action items on their text does not deduplicate them — an early version
  turned 8 items into 16. AI-authored items that are still untouched are deleted and
  rewritten; anything a human has engaged with (moved off OPEN, assigned an owner,
  attached evidence) or authored is preserved. Same rule for impacted functions.
  Regression test: `tests/test_action_item_refresh.py`.
- **Model output is untrusted input.** `AnalysisDraft` coerces sloppy-but-meaningful
  values (`"high"`, `85`, `"85%"`, `"null"`) and refuses harmful ones — an invented
  department code is dropped rather than stored, so the model cannot name an owner that
  does not exist.
- **A failed run never strands a circular.** It returns to `PARSED` with a readable
  `analysis_error`; the UI says the AI is unavailable and everything stays reviewable
  by hand.
- **Status is set before queueing, not after.** The other order races: a fast worker can
  finish and set `ANALYZED`, and the request would then overwrite it with `ANALYZING`.
- **`assert_analysable` vs `assert_has_text`.** The first is for the entry point only and
  rejects work already in flight (stops a double-click). The worker must use the second,
  or it rejects its own job.

Costs about 6k input / 2.5k output tokens and 20–70 s per circular — far inside free tier.

### Stage 3 — Verified citations ▶ NEXT
The model must return `{claim, quote, char_start, char_end}`. The worker checks the quote
against `raw_text` at those offsets, sets `verified: true/false`, and resolves the offset
to a page via `page_for_offset()`. Unverified citations are surfaced, not hidden.

### Stage 4 — Human review
Edit any field, see confidence, override the risk rating, publish. Publishing sets
`reviewed_by` and writes an audit row. `min_confidence_for_autoaccept` (0.75) marks
low-confidence analyses as review-required.

### Stage 5 — RCM
For each risk, the model is given **the entire 36-row control library in the prompt** and
picks the covering control with reasoning. No embeddings — at 36 rows in-context matching
is more accurate, costs nothing, and has no rate-limit failure mode. The pgvector columns
stay in the schema so "this scales to 5000 controls" remains true.

### Stage 6 — Tracker
Approved action items get owner + due date + status; overdue detection and reminders via
an ARQ cron.

---

## 3. Stack and the reasoning behind each choice

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | React 18 + Vite + TS + Tailwind | Plain SPA. **User explicitly rejected Next.js — do not reintroduce it.** |
| Backend | Python 3.13 + FastAPI, modular monolith | One language for CRUD, workflow and AI |
| Worker | ARQ over Redis, same codebase | Slow/retryable work off the request path |
| DB | Postgres 16 + pgvector | Relational integrity + vectors in one place |
| Storage | MinIO (S3-compatible) | Raw PDFs; swaps for real S3 by config |
| LLM | **LiteLLM → `gemini/gemini-3.7-flash`** | Free tier. Provider-agnostic: change `LLM_MODEL` + key, no code change |
| PDF text | **pdfplumber** (MIT) | PyMuPDF is AGPL-3.0 → needs a paid Artifex licence in a bank. pypdf has no per-char geometry |
| Rasterise | **pypdfium2** (already a pdfplumber dep) | No poppler, no system install |
| OCR | **RapidOCR** default, **Tesseract** preferred when installed | RapidOCR is pip-only (works on a fresh machine); Tesseract reads RBI's italic serif better. Both run **locally** — a regulatory document never leaves the environment, the same argument as control C-022 |
| Auth | JWT + RBAC (analyst/reviewer/owner/admin) | Scaffolded in `core/security.py`; **no `/auth/login` route yet** — built at Stage 4 |

**Cost rule: nothing paid.** Gemini free tier only.

---

## 4. Running it

```powershell
.\dev.ps1     # infra + API + ARQ worker + web, each in its own window
```
App http://localhost:3000 · API docs http://localhost:8000/docs · MinIO http://localhost:9001

**The worker matters.** Without `arq app.worker.settings.WorkerSettings` running, a scanned
upload sits at `PARSING` (the API's inline fallback only triggers when Redis itself is
unreachable, not when the worker is merely absent).

```powershell
cd apps\api
python -m scripts.seed              # upsert seed data (idempotent)
python -m scripts.seed --reset      # DROP the schema and rebuild
python -m pytest                    # 71 tests; DB-backed ones skip if Postgres is down
python -m ruff check app tests scripts
```

**The worker does not hot-reload.** After changing anything it imports, restart it — the
API's `--reload` will pick changes up, the worker will silently keep running old code.

**Tests that need the DB build their own engine.** pytest-asyncio gives each test a fresh
event loop and asyncpg connections are loop-bound, so reusing the app's shared engine
fails intermittently. See the `db` fixture in `tests/test_action_item_refresh.py`.

**There are no Alembic migrations.** Schema comes from `create_all` in `seed.py`. After
any model change, run `--reset` — it drops the whole `public` schema, which also clears
the Postgres ENUM types that `drop_all` leaves behind. Fine because no real data exists yet.

**Secrets:** `.env` is gitignored and holds real keys. `.env.example` is **tracked** —
never put a real value in it, and never write a "paste your key here" marker there.

---

## 5. Where things live

```
apps/api/app/
  core/        config · security (JWT/bcrypt) · logging (structlog) · storage (S3) · deps (RBAC)
  models/      all 13 ORM tables
  ai/          client (LiteLLM, retry + fallback) · prompts   ← all vendor specifics stop here
  modules/
    library/   read-only functions/controls/KCIs        (Stage 0)
    circulars/ upload · parser · ocr · service · router (Stage 1)
    analysis/  schemas (model-output validation) · service · router (Stage 2)
  worker/      queue (enqueue side) · tasks · settings
  api/router.py  ← plug every module router in here
apps/web/src/
  lib/api.ts   typed client · usePolling.ts
  components/  StatTile · RagBar · StatusChip · StatusBadge · RiskBadge · ConfidenceMeter · AnalysisPanel
  pages/       Home (foundation) · Circulars · CircularDetail
```

**Route ordering is a real hazard.** Routers share the `/circulars` prefix, and the
circulars router is included first — so a static path like `/circulars/llm-status` gets
swallowed by its `/{circular_id}`. Static routes must sit in the same router as the
`/{id}` they compete with (as `/circulars/ocr-status` does), or take their own prefix
(as `/llm/status` does). Never rely on include order.

Adding a module: `app/modules/<name>/{router,service,schemas}.py` → include in
`app/api/router.py` → page in `apps/web/src/pages/` → typed call in `lib/api.ts`.

---

## 6. Conventions

- **Colour is never the only signal.** RAG status ships as colour + glyph + word
  (`StatusChip`). The status palette (`--status-good/warning/critical` in `index.css`) is
  reserved for health and must never be reused as a series colour. Amber is below 3:1 on
  white by design — the icon+label pairing is the mitigation.
- Pipeline state (`StatusBadge`) uses neutral greys, not RAG colours — progress is not health.
- Errors reach the human with a **cause and a next action**, never a bare 500. A failed
  parse still creates a row with a readable `parse_error` and a Retry button.
- FastAPI errors are `{"detail": "..."}`; the web client unwraps that.
- Log with structlog key-values, not f-strings.
- Async SQLAlchemy: eager-load relationships (`selectinload`) or serialisation explodes.
- Static routes before `/{id}` routes in a router.

---

## 7. Known limits (say these out loud rather than pretending)

- OCR text can be wrong. RapidOCR garbles some italic serif lines; the UI warns which
  pages were machine-read. Installing Tesseract improves it.
- Hindi/Devanagari headers OCR poorly with the default models (needs `hin.traineddata`
  and `OCR_LANGUAGES=eng+hin`). Body text is English, so this is cosmetic.
- A PDF whose text layer exists but is garbage (bad embedded encoding) is not detected —
  it is treated as valid text. No reliable heuristic was worth the false positives.
- If the worker is down, scanned uploads stay at `PARSING` until it comes back.
- `ocr_max_pages` (60) rejects very large scans rather than occupying the worker.
