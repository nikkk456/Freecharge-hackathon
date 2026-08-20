# Architecture — Compliance Advisory Copilot (CAC)

> FreeCharge Hackathon · Use case: **Categorisation of Risk Rating of Circulars, closure of action items, and RCM creation.**

> **Status:** this is the *target design*. The repository is currently a **scaffold** —
> structure, infra, config, and the data model are in place; feature logic is **not built
> yet** and will be added deliberately, phase by phase (see [ROADMAP.md](./ROADMAP.md)).

## 1. The one-paragraph summary

CAC ingests regulatory circulars (RBI/SEBI) and internal committee reviews, uses an
LLM + RAG pipeline to produce a **grounded, cited** analysis — plain summary, impacted
functions, a suggested risk rating with reasoning, and extracted action items — then puts
a **human in the loop** to review/override before anything is published. From the published
analysis it drafts a **Risk & Control Matrix (RCM)**, maps rows to an existing control/KCI
library, and drops the action items into a tracker with owners, due dates, and SLA/TAT
escalation. Every AI suggestion and every human decision is written to an **immutable,
hash-chained audit log**.

## 2. The single most important design fact

This is a **low-volume, high-stakes** system — hundreds to a few thousand circulars, not
millions of requests. **The hard problem is trust and correctness, not scale.** Every
architectural choice below optimizes for *explainability, auditability, and never losing a
deadline* — not throughput.

## 3. Chosen stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **React + Vite + TypeScript + Tailwind** | Plain React SPA (no SSR framework) — simple mental model, fast dev server. |
| Backend | **Python 3.13 + FastAPI (modular monolith)** | One language for all CRUD/workflow/auth **and** the AI. Python has the strongest OCR/RAG/LLM ecosystem, which is where the demo is won. |
| Async AI | **Same codebase run as an ARQ worker** (Redis-backed) | Preserves the "one separate async AI worker" principle without a second language. LLM calls are slow/retryable and must never block the API. |
| DB | **PostgreSQL 16 + pgvector** | ACID + clean audit trail; relational data (circular→actions→controls→KCIs); vector search in the *same* DB — one less moving part. |
| Object store | **MinIO (S3-compatible)** | Stores the raw PDFs; swaps for real S3 in prod with no code change. |
| Queue/cache | **Redis + ARQ** | Async job queue for AI analysis; idempotent, retried with backoff. |
| LLM gateway | **LiteLLM** | **Provider-agnostic.** Point `LLM_MODEL` at OpenAI / Anthropic / Azure / local Ollama and drop in the matching key — no code change. |
| Orchestration | **LangGraph** | Multi-step analysis graph with checkpointing + human-in-the-loop interrupt/resume. |
| Auth | **JWT + RBAC** (SSO-ready) | Roles: analyst, reviewer, owner, admin. Real SSO is a prod swap. |

> **Pitch line for judges:** "The demo runs on OpenAI, but the LLM layer is a provider
> abstraction — in production we point it at the bank's approved/on-prem model and nothing
> else changes, because regulatory data cannot leave the approved environment."

## 4. Component map (modular monolith)

```
                         ┌──────────────────────────┐
      Browser  ───────▶  │  React SPA (apps/web)     │
                         └────────────┬─────────────┘
                                      │ REST (JSON)
                         ┌────────────▼─────────────────────────────────┐
                         │           FastAPI monolith (apps/api)         │
                         │                                               │
                         │  modules/    circulars  analysis  rcm         │
                         │              action_items  submissions  auth  │
                         │              audit  search  dashboard         │
                         │  core/       config  security  logging  deps  │
                         │  db/         async SQLAlchemy + pgvector       │
                         │  ai/         llm provider · prompts ·          │
                         │              citation grounding · LangGraph    │
                         └───┬───────────────┬──────────────┬────────────┘
             enqueue job     │               │              │
                         ┌───▼────┐     ┌─────▼─────┐   ┌────▼──────┐
                         │ Redis  │     │ Postgres  │   │  MinIO    │
                         │ (ARQ)  │     │ +pgvector │   │  (PDFs)   │
                         └───┬────┘     └───────────┘   └───────────┘
              consume job    │
                         ┌───▼───────────────────────────┐
                         │  ARQ worker (apps/api, worker/)│
                         │  OCR → chunk → RAG → LLM →     │
                         │  citation-grounded analysis    │
                         └────────────────────────────────┘
```

Every module is a self-contained package (`models`, `schemas`, `service`, `router`). The
boundaries are clean enough that any module could later be extracted into its own service —
but we **ship the monolith now**.

## 5. Critical flows

**Flow A — Intake → published analysis**
`upload PDF → store in MinIO → parse/OCR → chunk with char offsets → enqueue AI job →
worker: RAG (similar past circulars + existing controls) → LLM structured extraction →
citation grounding/verification → draft AIAnalysis (status=DRAFT) → human reviews & edits →
publish (status=PUBLISHED)`.

**Flow B — RCM creation** — from a published analysis, AI proposes Risk→Control rows and
maps each to an existing KCI → human accepts/edits → RCM saved.

**Flow C — Action item lifecycle** — `create → assign owner + due date → track → reminder
before due → escalate on breach → close only with evidence + human sign-off`.

**Flow D — Submission review** (Phase 3) — a response from CAMS/GCM (mocked) is linked to its
action item → AI checks "does this actually address the obligation?" → flags gaps.

**Flow E — RAR / policy gap analysis** (Phase 4) — AI compares RAR/policy against extracted
obligations → surfaces what's missing.

## 6. The three things that win the demo

1. **Citation grounding is verified, not trusted.** The LLM must return the character span it
   used; the worker checks that span actually exists in the raw text and rejects/flags any
   citation it can't verify. This is what convinces judges it isn't hallucinating.
2. **HITL is enforced by the state machine.** Nothing is `PUBLISHED`, no action item is
   `CLOSED`, and nothing is auto-submitted without a human decision — the DB status enum makes
   this structurally impossible to skip.
3. **Immutable, hash-chained audit log.** Every AI suggestion and human edit is one append-only
   row whose hash chains to the previous — the "regulators will ask" story, demonstrable live.

## 7. Design-for-failure rules (encoded, not aspirational)

- LLM down/slow → job is queued and retried with backoff; the UI shows *"AI unavailable —
  review manually"* and the human can still do everything by hand. **The AI never blocks the human.**
- **Never auto-close, never auto-submit.** Closing actions require a human + evidence.
- **Low confidence forces review** — below a threshold, the item cannot be auto-accepted.
- **Idempotent jobs** — a retried analysis never double-creates action items (dedup key per circular+version).
- **No silent failures** — every failure surfaces to a human and is logged.

See [DATA_MODEL.md](./DATA_MODEL.md) for entities and [ROADMAP.md](./ROADMAP.md) for phasing.
