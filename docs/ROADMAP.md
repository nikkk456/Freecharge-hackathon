# Roadmap — phased build

Phasing keeps the demo tight and defensible. Build **Phase 0 end-to-end first**; everything
after is additive and the module boundaries already exist for it.

## Phase 0 — Hackathon MVP (the thing you demo) ⭐
The vertical slice that must work start to finish:

1. Upload one real RBI circular PDF.
2. Parse → clean text (OCR fallback for scanned).
3. AI produces **summary + impacted functions + risk rating + action items**, each carrying
   the **exact source line it used** (verified citation).
4. Human review screen — edit any field, see confidence, accept/override, **publish**.
5. Generate a **draft RCM** mapped to a small mock control library.
6. Action items land in a **simple tracker** with owners + due dates.

**Magic moment:** click a claim → the source sentence highlights in the original circular.
Nobody thinks it's hallucinating.

**Status checklist**
- [x] docker infra up (Postgres+pgvector, Redis, MinIO)
- [x] DB schema (via `scripts/seed.py` `create_all`; Alembic migrations deferred)
- [x] Foundation layer seeded + exposed: 18 functions, 36 controls, 31 KCIs
- [x] Upload + store PDF + parse to text (pdfplumber; per-page char offsets in `page_map`)
- [x] OCR fallback for scanned pages (per-page; RapidOCR/Tesseract; ARQ worker)
- [x] LLM provider abstraction (LiteLLM → Gemini) + structured analysis prompt
- [x] ARQ async analysis job (summary, functions, risk rating, action items)
- [x] Citation grounding + verification (model quotes; our code finds and checks offsets)
- [x] Review UI with citation highlighting (click a claim → its line highlights)
- [x] JWT login + RBAC (only reviewer/owner may approve)
- [x] Human review: edit any field, override the rating, approve → PUBLISHED (frozen)
- [x] Audit log on every step (hash-chained, tamper-evident, verifiable live)
- [x] Draft RCM + control-library matching (whole 36-row library in-context, no embeddings)
- [x] Action item tracker (owner, due date, state machine, evidence-gated closure)
- [x] Overdue detection via a daily ARQ cron (idempotent; raises alarms, never moves work)
- [~] Chunk with char offsets + embed + store vectors — **deliberately not done.** Char
      offsets live on `circulars.page_map` and drive citations without embeddings; the
      36-row control library is matched in-context, which is more accurate at this size.
      The pgvector columns remain so this scales when the library does.

## Phase 1 — Closure workflow
Reminders, SLA/TAT escalation, overdue detection (scheduled ARQ cron), evidence-gated close.

## Phase 2 — KCI mapping + semantic search
Map RCM rows against the **real** control/KCI library; semantic search across all past circulars.

## Phase 3 — CAMS/GCM submission linking
Mocked adapters; link responses to action items; AI "does this response address the obligation?" check.

## Phase 4 — RAR / policy gap analysis
AI compares RAR/policy submissions against extracted obligations; surfaces gaps.

## Explicitly out of scope for the hackathon
- Live two-way integration with real CAMS/GCM (mock the interface).
- Auto-submission to any regulator.
- Any AI decision that closes/publishes without a human. **Always HITL.**
