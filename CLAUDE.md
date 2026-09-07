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
| 3 | **Verified citations** — every claim carries its exact source line | ✅ done | Click a claim → its source line highlights |
| 4 | Review screen — human edits and approves the draft | ✅ done | Change the risk rating, press Approve |
| 5 | RCM — match AI risks to the existing control library | ✅ done | A risk↔control table is produced |
| 6 | Tracker — action items with owner, due date, status, reminders | ✅ done | An item shows "in progress" |

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
- **The extracted text is the document's English; Devanagari is removed, not decoded.**
  RBI's bilingual letterhead does not survive the text layer. It comes out broken two
  ways at once: conjuncts the font's ToUnicode CMap has no entry for (`क��ीय` for
  केंद्रीय — those are real U+FFFDs) and vowel signs stored where they are *drawn* rather
  than where Unicode puts them (`िनपटान` for निपटान). Reversing the second is mechanical
  and tempting; around a U+FFFD hole it yields a different, valid-*looking* Hindi word,
  and a plausible wrong word is worse than a visible misspelling. So `drop_unreadable_text()`
  strips Devanagari outright and repairs nothing. Latin welded to a Hindi token is kept,
  because it is English and it is correct: `फोनTel:` → `Tel:`, `ई-मेलe-mail` → `e-mail`.
  Words the font holed go **whole** (deleting just the U+FFFDs from `क��ीय` splices `कीय`
  out of the two halves), and a line is dropped once nothing with a Latin letter survives
  it — the address block leaves `", , 14, ,, -"`, and a model quoting that fragment would
  produce a citation that verifies perfectly against text carrying no meaning. Only lines
  the function actually rewrote face that test, so a numeric English line (`400001`) is
  never at risk, and only Devanagari is targeted — ₹ stays, since a rupee figure is often
  the obligation itself. Lines with neither pass through byte for byte: the 21k-char
  recovery circular re-parses identical.

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

Costs about 6k input / 2.5k output tokens per circular — far inside free tier. Usually
20–70 s, but a bad free-tier spike can push it to ~270 s once the retry/fallback chain
kicks in. That is the system working, not hanging; poll generously.

### Stage 3 — Verified citations ✅
Every claim the UI shows — the risk rating, each impacted department, each action item —
carries a citation stored in `ai_analyses.citations`. Live result on the RBI recovery
circular: **14 of 14 verified**.

**The model returns a quote, never an offset.** This inverts what `ARCHITECTURE.md`
originally described, deliberately. Asking a model for `char_start`/`char_end` and then
checking those numbers means trusting the thing under test — models invent plausible
offsets freely. Quoting is the one part of this they are reliable at, so it is the only
part we ask for. `ai/grounding.py` searches `raw_text` for the quote and produces the
offsets itself.

**Matching cannot be a substring search.** PDFs wrap sentences, so a model quoting one
sentence has spaces where `raw_text` has newlines. `normalise_with_map()` builds a
whitespace-collapsed copy *plus an index map* back to true offsets, and also rejoins
words hyphenated across a line break. Tiers, each recorded in `match`: `exact` →
`normalised` → `case_insensitive` → `not_found`.

- **A quote under `MIN_CITATION_QUOTE_CHARS` (16) is refused, not searched.** "the bank"
  occurs everywhere; locating it proves nothing about which occurrence supports the claim.
- **Claims with no evidence still produce a citation**, marked unverified. Dropping them
  would hide that the model asserted something it could not support.
- **`source_text` is the document's wording**, not the model's — it may differ in
  whitespace, which is exactly what proves we found the real line.
- **Page furniture is stripped at parse time.** A page-number footer lands mid-sentence in
  the extracted flow (`"...(Commercial Banks - 3 Managing Risks in Outsourcing)..."`) and
  breaks any citation spanning that page boundary. `strip_page_number()` removes a bare
  number that is alone on the page's first or last line *and* equals that page's own
  number — narrow enough that it cannot eat content. This took the real circular from
  11/12 to 14/14.

**When debugging citations on Windows, read JSON as UTF-8.** `json.load(open(path))` uses
cp1252, so `₹` becomes three characters and every offset after it appears shifted by two.
That cost an hour chasing a bug that did not exist.

### Stage 4 — Human review ✅
Real JWT login, an editable draft, and approval that is enforced rather than assumed.
Three things landed together because none of them means anything alone: an approval
needs a named person, a person needs something to change, and a change needs a record.

**A PUBLISHED analysis is frozen.** `assert_editable` rejects every edit path once
published (409). An approval that could be silently rewritten afterwards is not an
approval. Re-running the AI is still allowed — it produces a *new* DRAFT version, and
publishing that steps the old one down to SUPERSEDED, so exactly one published version
exists per circular.

**RBAC.** Anyone signed in may edit a draft; only `reviewer`/`owner` (and `admin`, the
break-glass role) may publish. An analyst drafts, someone else signs.

**Human assertions survive the AI.** Adding a department a reviewer confirms sets
`source=HUMAN`, and `_replace_impacted_functions` only clears AI-sourced rows — so a
re-run cannot delete a human's judgement. Same rule for action items, from Stage 2.

**The audit chain** (`modules/audit/`) records every AI suggestion and human decision.
Each row's sha256 covers its content *plus the previous row's hash*.
`GET /api/v1/audit/verify` walks it and distinguishes the two ways it breaks: a row
whose own hash no longer matches (that row was altered) versus a row whose `prev_hash`
does not match its predecessor (a row was deleted or inserted). Both verified live
against Postgres. `seq` (a BigInteger identity) orders the chain — `created_at` is not
enough, since two rows in the same millisecond have no defined predecessor — and
`_last_row` takes `FOR UPDATE` so concurrent writers cannot fork it.

Things that bite here:
- **Audit payloads must be JSON.** `_plain` flattens enums/UUIDs/dates for readability
  and `audit.jsonable` coerces at the boundary. A raw UUID in `after` once made the
  JSONB insert throw, which would have rolled back the change it was recording.
- **A no-op edit writes nothing.** Saving an unchanged field would pollute the trail.
- **An audit write is never wrapped in try/except.** If it fails, the action fails with
  it. A change without a trail is worse than no change.
- **DB-backed tests append to the chain permanently** — the review functions commit,
  and an append-only log cannot be cleaned up without breaking what it protects. Tests
  verify only their own segment via `verify_chain(since_seq=...)`. Run
  `python -m scripts.seed --reset` before a demo for a clean trail.

### Stage 5 — RCM ✅
For each risk the circular creates, does an existing control already answer it? The model
gets **the entire 36-row control library in the prompt** — no embeddings. At 36 rows,
in-context matching is more accurate, costs nothing, and has no rate-limit failure mode.
The pgvector columns stay in the schema so "this scales to 5000 controls" remains true.

Live result on the RBI recovery circular: 7 rows, 1 COVERED, 3 PARTIAL, **3 GAP**, 7/7
citations verified. The gaps are real — device-locking, agency-list publication and
advance-visit notice are new 2026 obligations the old library never anticipated.

**The one rule that matters: a row may never claim more coverage than it can point at.**
`_reconcile` forces `coverage=GAP` whenever no real control is mapped, and the same guard
runs on human edits. Reporting a risk as COVERED with nothing behind it *hides work*,
which is the single most damaging thing this feature could do — far worse than flagging a
gap a reviewer then corrects. Note it only ever moves toward **more** work, never less: a
row naming a real control but still saying GAP is left alone, because "this control exists
and does not answer the risk" is a finding, not a contradiction.

- **KCI is derived, never asked for.** control → KCI is a fact in our own data; asking the
  model would invite it to invent one. That is what makes "covered by C-006, currently
  **amber**" trustworthy.
- **The approved analysis is context, not gospel.** Summary, rating and action items go
  into the prompt so the model reaches the conclusions a human already approved, rather
  than re-deriving a different set of risks and confusing the reviewer.
- **Regenerating replaces AI rows, never human ones** — the same rule as action items.
- **A published RCM is frozen**, exactly like an analysis. One RCM per circular; rebuilding
  replaces the draft rather than versioning, since the analysis version is already audited.
- Every risk carries a verified citation (`target_kind="rcm_row"`), reusing Stage 3's
  grounding unchanged.

### Stage 6 — Tracker ✅
Every extracted obligation gets a named owner, a deadline, a tracked status, and a
closure that a regulator would accept. `modules/tracker/` owns an action item's whole
life once Stage 2 has created it.

**The state machine is data, not branching code** (`tracker/service.TRANSITIONS`), so the
legal moves read at a glance and the UI is driven by the same table the API enforces —
the frontend offers exactly `allowed_transitions` and cannot present an illegal move.

**CLOSED is reachable only from SUBMITTED.** That is maker-checker: work must be put
forward before anyone signs it off, so the person who did it cannot also approve it.
Closing additionally requires the `reviewer`/`owner` role *and* evidence (a link or a
note). "Never auto-close" only means something if closure is impossible without
something to point at afterwards.

**Overdue is derived, never stored.** There is deliberately no `OVERDUE` member in
`ActionItemStatus`. An item can be IN_PROGRESS *and* late; writing OVERDUE into the
status would destroy the only record of what was actually happening to it. `is_overdue`
is computed from the due date, and the SQL filter in `list_items` mirrors that function
exactly so the filter and the flag cannot disagree.

**The cron raises alarms; it never moves work.** `sweep_overdue` runs at 08:00 daily
(`run_at_startup=False` — a worker restart should not fire reminders). It is idempotent
by `last_reminder_at`: a second run the same day, or an ARQ retry, notifies nobody
twice. It writes a SYSTEM-actor audit row and changes no statuses, because a scheduled
job advancing work would break the rule that nothing progresses without a human.
`POST /action-items/sweep` runs the same routine on demand — a demo cannot wait until
08:00, and being able to trigger it is how you verify it is honest.

Other things that matter here:
- **Reopening clears the closure record.** Live work carrying a stale `closed_by` would
  misrepresent who is accountable for it now.
- **Closed items cannot be edited or deleted** — they are the compliance record.
- **A disabled account cannot own work**, so departed staff cannot be assigned to it.
- **Action-item endpoints live only in `modules/tracker`.** They were moved out of
  `modules/analysis`: two routers sharing the `/action-items` prefix would shadow each
  other depending on include order.

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
| Auth | JWT + RBAC (analyst/reviewer/owner/admin) | Real login as of Stage 4. Everything is behind sign-in: an approval must be attributable to a person |

**Cost rule: nothing paid.** Gemini free tier only.

---

## 4. Running it

```powershell
.\dev.ps1     # Windows: infra + API + ARQ worker + web, each in its own window
```
```bash
./dev.sh      # macOS/Linux: same four; --inline runs them in one terminal
```
App http://localhost:3000 · API docs http://localhost:8000/docs · MinIO http://localhost:9001

**The worker matters.** Without `arq app.worker.settings.WorkerSettings` running, a scanned
upload sits at `PARSING` (the API's inline fallback only triggers when Redis itself is
unreachable, not when the worker is merely absent).

```powershell
cd apps\api    # macOS: cd apps/api; source .venv/bin/activate
python -m scripts.seed              # upsert seed data (idempotent)
python -m scripts.seed --reset      # DROP the schema and rebuild
python -m pytest                    # 238 tests; DB-backed ones skip if Postgres is down
python -m ruff check app tests scripts
```

**Never `pip install` a package without adding it to `pyproject.toml`.** This already
broke a colleague's clone: `litellm` was installed ad-hoc during Stage 2 and never
declared, so everything worked here and `No module named 'litellm'` greeted the first
person who cloned the repo. Three more (`pypdfium2`, `numpy`, `botocore`) were being
imported directly while arriving only as transitive dependencies — a transitive
dependency is not a promise. `tests/test_dependencies_declared.py` now fails when an
import is undeclared. Verify a real change with a clean venv, not with your own:

```powershell
python -m venv $env:TEMP\clean; & $env:TEMP\clean\Scripts\pip install -e ".[dev]"
& $env:TEMP\clean\Scripts\python -m pytest
```
```bash
# macOS/Linux
python3 -m venv /tmp/clean && /tmp/clean/bin/pip install -e ".[dev]"
/tmp/clean/bin/python -m pytest
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
  ai/          client (LiteLLM, retry + fallback) · prompts · grounding (citation verification)
  modules/
    library/   read-only functions/controls/KCIs        (Stage 0)
    circulars/ upload · parser · ocr · service · router (Stage 1)
    analysis/  schemas (model-output validation) · service · router (Stage 2)
               review.py — human edits + publish state machine        (Stage 4)
    auth/      login, /me                                             (Stage 4)
    audit/     hash-chained trail + chain verification                (Stage 4)
    rcm/       generation · review · router — risk↔control matching   (Stage 5)
    tracker/   service (state machine) · workflow (mutations) · router (Stage 6)
  worker/      queue (enqueue side) · tasks · settings
  api/router.py  ← plug every module router in here
apps/web/src/
  lib/api.ts   typed client · usePolling.ts · auth.tsx (AuthProvider/useAuth)
  components/  StatTile · RagBar · StatusChip · StatusBadge · RiskBadge · ConfidenceMeter
               AnalysisPanel · CitationChip · HighlightedText · ReviewControls
               RcmPanel · CoverageChip · ControlDetailDialog
  components/ui/  Dialog (informational) vs AlertDialog (role=alertdialog, interrupts
               for a decision) · Select (Radix listbox; `""` is the sentinel for
               "nothing chosen", translated in the wrapper because Radix rejects an
               empty item value)
  pages/       Home (foundation) · Circulars · CircularDetail · Login · Audit · Tracker
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
- Static routes before `/{id}` routes in a router.

**Async SQLAlchemy has three traps, and Stage 5 hit all three.** Learn them once:
1. **Eager-load, or it raises.** Touching an unloaded relationship (`rcm.rows`,
   `control.kcis`) does IO from attribute access, which async SQLAlchemy cannot do:
   `MissingGreenlet`. Use `selectinload` in the query, or query the child rows directly.
   A freshly `add`ed + `flush`ed parent has *no* loaded collections.
2. **`populate_existing=True` when re-reading after a write.** Endpoints that mutate then
   re-read to return the result get the same identity-mapped object with its *old*
   collection — the response silently omits the row just created. `expire_on_commit=False`
   means the commit does not refresh it either.
3. **`or` is not a null check.** `(select(func.max(...))).scalar() or -1` returns `-1` when
   the real answer is `0`, because zero is falsy. Every row then got `position=0`. Use
   `x if x is not None else default`.

---

## 7. Known limits (say these out loud rather than pretending)

- OCR text can be wrong. RapidOCR garbles some italic serif lines; the UI warns which
  pages were machine-read. Installing Tesseract improves it.
- Hindi/Devanagari headers OCR poorly with the default models (needs `hin.traineddata`
  and `OCR_LANGUAGES=eng+hin`). Body text is English, so this is cosmetic.
- Devanagari is **dropped, not recovered**: the extracted text is the English document.
  RBI writes the obligations in English and repeats the Hindi letterhead in English on the
  next line, so nothing of substance goes — but a circular that carried a Hindi-only
  obligation would lose it silently. Reading it would need the page rasterised and OCR'd
  in Hindi, which is the bullet above.
- A PDF whose text layer exists but is garbage (bad embedded encoding) is not detected —
  it is treated as valid text. No reliable heuristic was worth the false positives.
- If the worker is down, scanned uploads stay at `PARSING` until it comes back.
- `ocr_max_pages` (60) rejects very large scans rather than occupying the worker.
