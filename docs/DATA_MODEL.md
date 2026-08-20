# Data Model — Compliance Advisory Copilot

PostgreSQL 16 + pgvector. All primary keys are UUIDs (`gen_random_uuid()`). All tables carry
`created_at` / `updated_at` (UTC). Vector columns live in the same DB via pgvector.

## Entity relationships (plain terms)

- One **Circular** has many **AIAnalysis** versions (history is kept on re-run).
- One **Circular** links to many **Functions** (impacted) — via `circular_functions`.
- One **Circular** has many **ActionItems**.
- One **Circular** has one **RCM**; an RCM has many **RcmRow** (risk→control) records.
- One **Control** maps to one or many **KCIs**.
- One **ActionItem** has one **Owner** (User), a status, a due date, and closure evidence.
- One **Submission** links to an ActionItem and/or a Circular.
- Every AI suggestion and every human edit writes an **AuditLog** row (hash-chained).
- **CircularChunk** and **ControlLibraryItem** hold vector embeddings for RAG.

```
User ──owns──< ActionItem >──belongs──┐
                                       │
Circular ──1:N──< AIAnalysis           │
   │  ├──1:N──< ActionItem >───────────┘
   │  ├──1:N──< CircularChunk (vector)
   │  ├──M:N──< Function (via circular_functions)
   │  └──1:1──< RCM ──1:N──< RcmRow >──maps──> Control ──1:N──< KCI
   │
   └──1:N──< Submission >──links──> ActionItem
AuditLog (append-only, hash-chained)  ← written by every mutation
```

## Tables

### `users`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| full_name | text | |
| hashed_password | text | bcrypt |
| role | enum(`analyst`,`reviewer`,`owner`,`admin`) | RBAC |
| is_active | bool | |

### `circulars`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| source | enum(`RBI`,`SEBI`,`PMC`,`CMC`,`INTERNAL`,`OTHER`) | |
| ref_no | text | regulator's reference number |
| title | text | |
| issued_date | date | |
| raw_text | text | extracted clean text |
| pdf_object_key | text | key in MinIO/S3 |
| status | enum(`UPLOADED`,`PARSING`,`PARSED`,`ANALYZING`,`ANALYZED`,`PUBLISHED`,`FAILED`) | |
| uploaded_by | uuid FK→users | |

### `circular_chunks`  *(RAG source for a circular)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| circular_id | uuid FK | |
| chunk_index | int | order in document |
| text | text | the chunk |
| char_start / char_end | int | **offsets into `circulars.raw_text` — the basis of verifiable citations** |
| embedding | vector(EMBEDDING_DIM) | pgvector |

### `functions`  *(master list of internal departments)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| name | text unique | e.g. "Collections", "KYC/AML", "IT Security" |
| description | text | |

### `circular_functions`  *(M:N join — impacted functions per circular)*
| column | type | notes |
|---|---|---|
| circular_id | uuid FK | |
| function_id | uuid FK | |
| confidence | float | AI confidence 0–1 |
| reasoning | text | why this function is impacted |
| source | enum(`AI`,`HUMAN`) | who asserted it |

### `ai_analyses`  *(versioned model output)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| circular_id | uuid FK | |
| version | int | increments per re-run |
| status | enum(`DRAFT`,`PUBLISHED`,`SUPERSEDED`) | HITL gate |
| summary | text | plain-language summary |
| risk_rating | enum(`LOW`,`MEDIUM`,`HIGH`,`CRITICAL`) | suggested |
| risk_reasoning | text | why this rating |
| confidence | float | overall 0–1 |
| citations | jsonb | list of `{claim, quote, char_start, char_end, verified}` |
| model_name | text | which LLM produced it |
| created_by | uuid FK→users | analyst who ran it |
| reviewed_by | uuid FK→users | reviewer who published it |

### `action_items`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| circular_id | uuid FK | |
| description | text | |
| owner_id | uuid FK→users | |
| due_date | date | |
| status | enum(`OPEN`,`IN_PROGRESS`,`BLOCKED`,`SUBMITTED`,`CLOSED`,`OVERDUE`) | |
| priority | enum(`LOW`,`MEDIUM`,`HIGH`) | |
| evidence_url | text | required to close |
| closed_by | uuid FK→users | human sign-off |
| source | enum(`AI`,`HUMAN`) | |
| dedup_key | text unique | idempotency: `circular_id:norm(description)` |

### `rcms`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| circular_id | uuid FK unique | one RCM per circular |
| status | enum(`DRAFT`,`PUBLISHED`) | |

### `rcm_rows`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| rcm_id | uuid FK | |
| risk_text | text | |
| control_text | text | |
| mapped_control_id | uuid FK→controls (nullable) | existing control if matched |
| mapped_kci_id | uuid FK→kcis (nullable) | |
| confidence | float | AI match confidence |
| source | enum(`AI`,`HUMAN`) | |

### `controls`  *(control library — RAG source)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| code | text unique | e.g. "CTL-KYC-001" |
| name | text | |
| description | text | |
| embedding | vector(EMBEDDING_DIM) | for "existing controls that already cover this" |

### `kcis`  *(Key Control Indicators)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| control_id | uuid FK→controls | |
| name | text | |
| target | text | threshold/target |
| frequency | enum(`DAILY`,`WEEKLY`,`MONTHLY`,`QUARTERLY`) | |

### `submissions`  *(responses from CAMS/GCM — mocked in MVP)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| circular_id | uuid FK (nullable) | |
| action_item_id | uuid FK (nullable) | |
| source_system | enum(`CAMS`,`GCM`,`MANUAL`) | |
| content | text | the response text |
| gap_analysis | jsonb | AI verdict: addresses obligation? gaps? |
| status | enum(`RECEIVED`,`REVIEWED`,`ACCEPTED`,`REJECTED`) | |

### `audit_logs`  *(append-only, hash-chained — never UPDATE/DELETE)*
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| entity_type | text | e.g. "ai_analysis", "action_item" |
| entity_id | uuid | |
| action | text | e.g. "AI_SUGGESTED", "HUMAN_EDITED", "PUBLISHED", "CLOSED" |
| actor_id | uuid FK→users (nullable; null = system/AI) | |
| actor_kind | enum(`HUMAN`,`AI`,`SYSTEM`) | |
| before | jsonb | prior state (nullable) |
| after | jsonb | new state |
| prev_hash | text | hash of the previous audit row |
| hash | text | sha256(prev_hash + canonical(this row)) — tamper-evident chain |
| created_at | timestamptz | |

## Indexes that matter
- `circular_chunks.embedding` — pgvector HNSW/IVFFlat index for ANN search.
- `controls.embedding` — same, for control-library matching.
- `action_items (status, due_date)` — the overdue/escalation query.
- `ai_analyses (circular_id, version)` — latest-version lookup.
- `audit_logs (entity_type, entity_id, created_at)` — audit reconstruction.
