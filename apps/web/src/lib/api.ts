// Typed API client. In dev, Vite proxies /api and /health to FastAPI (vite.config.ts).
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const TOKEN_KEY = "cac.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private mode / blocked storage
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — the session simply will not persist a reload */
  }
}

/** Raised on 401 so the app can send the user to log in instead of showing an error. */
export class Unauthorized extends Error {}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // FormData must set its own Content-Type so the multipart boundary is included.
  const isForm = init.body instanceof FormData;
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    setToken(null);
    throw new Unauthorized(await readError(res));
  }
  if (!res.ok) throw new Error(await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// FastAPI reports failures as {"detail": "..."} — surface that, not raw JSON.
async function readError(res: Response): Promise<string> {
  const body = await res.text();
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
  } catch {
    /* not JSON — fall through to the raw body */
  }
  return `${res.status} ${body}`.trim();
}

export interface Health {
  status: string;
  service: string;
}

export type RagStatus = "green" | "amber" | "red";

export interface FunctionOut {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export type KciFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY";

export interface KciOut {
  id: string;
  code: string;
  name: string;
  target: string | null;
  current_value: string | null;
  status: RagStatus;
  /** How often the reading is refreshed — "99.6% vs >=99%" means something different
   *  measured daily than measured quarterly. */
  frequency: KciFrequency;
}

export interface ControlOut {
  id: string;
  code: string;
  name: string;
  description: string | null;
  owner_function: FunctionOut | null;
  kcis: KciOut[];
}

export interface KciWithControl extends KciOut {
  control_code: string;
  control_name: string;
}

export interface LibraryStats {
  functions: number;
  controls: number;
  kcis: number;
  users: number;
  circulars: number;
  kci_status_mix: Partial<Record<RagStatus, number>>;
}

export type CircularSourceName = "RBI" | "SEBI" | "PMC" | "CMC" | "INTERNAL" | "OTHER";

export type CircularStatusName =
  | "UPLOADED"
  | "PARSING"
  | "PARSED"
  | "ANALYZING"
  | "ANALYZED"
  | "PUBLISHED"
  | "FAILED";

export type TextSource = "text_layer" | "ocr" | "empty";

export interface PageSpan {
  page: number;
  char_start: number;
  char_end: number;
  source: TextSource;
  /** Characters removed because the PDF's font could not encode them — see
   *  `parser.drop_unreadable_text`. Absent on page maps stored before that existed. */
  unreadable_chars?: number;
}

export interface OcrStatus {
  enabled: boolean;
  configured_engine: string;
  available_engines: string[];
  ready: boolean;
  detail: string;
}

export interface CircularSummary {
  id: string;
  source: CircularSourceName;
  ref_no: string | null;
  title: string | null;
  issued_date: string | null;
  status: CircularStatusName;
  page_count: number | null;
  parse_error: string | null;
  analysis_error: string | null;
  created_at: string;
}

export interface CircularDetail extends CircularSummary {
  raw_text: string | null;
  page_map: PageSpan[] | null;
  char_count: number;
}

export type RiskRating = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PriorityName = "LOW" | "MEDIUM" | "HIGH";

export type CitationMatch =
  | "exact"
  | "normalised"
  | "case_insensitive"
  | "not_found"
  | "too_short"
  | "empty";

export interface Citation {
  claim: string;
  quote: string;
  target_kind: "risk" | "function" | "action_item" | "summary" | "rcm_row";
  target_ref: string | null;
  char_start: number | null;
  char_end: number | null;
  page: number | null;
  /** Our code located this quote in raw_text — not the model's say-so. */
  verified: boolean;
  match: CitationMatch;
  occurrences: number;
  /** The document's own wording at those offsets, which may differ from `quote`
   *  in whitespace where the PDF wrapped the line. */
  source_text: string | null;
}

export interface ImpactedFunction {
  code: string;
  name: string;
  confidence: number | null;
  reasoning: string | null;
  source: "AI" | "HUMAN";
  citation: Citation | null;
}

export interface ActionItem {
  id: string;
  description: string;
  priority: PriorityName;
  status: string;
  due_date: string | null;
  owner_function_code: string | null;
  owner_function_name: string | null;
  source: "AI" | "HUMAN";
  citation: Citation | null;
}

export interface Analysis {
  id: string;
  circular_id: string;
  version: number;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
  summary: string | null;
  risk_rating: RiskRating | null;
  risk_reasoning: string | null;
  confidence: number | null;
  model_name: string | null;
  created_at: string;
  published_at: string | null;
  reviewed_by_name: string | null;
  edited_by_name: string | null;
  /** False once published — the API refuses edits, and the UI must not offer them. */
  editable: boolean;
  needs_review: boolean;
  citations_total: number;
  citations_verified: number;
  risk_citation: Citation | null;
  citations: Citation[];
  impacted_functions: ImpactedFunction[];
  action_items: ActionItem[];
}

export interface AnalysisRunAccepted {
  circular_id: string;
  status: string;
  queued: boolean;
  detail: string;
}

export interface LlmStatus {
  configured: boolean;
  model: string;
  fallbacks: string[];
  detail: string;
}

export type RoleName = "analyst" | "reviewer" | "owner" | "admin";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: RoleName;
  is_active: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  user: User;
}

export interface PublishResult {
  analysis_id: string;
  circular_id: string;
  status: string;
  version: number;
  published_at: string | null;
  reviewed_by: string;
  detail: string;
}

export type CoverageName = "COVERED" | "PARTIAL" | "GAP";

export interface MappedControl {
  code: string;
  name: string;
  owner_function_code: string | null;
  owner_function_name: string | null;
  kci_code: string | null;
  kci_name: string | null;
  kci_status: RagStatus | null;
  kci_target: string | null;
  kci_current_value: string | null;
}

export interface RcmRow {
  id: string;
  position: number;
  risk_text: string;
  control_text: string;
  coverage: CoverageName;
  reasoning: string | null;
  confidence: number | null;
  source: "AI" | "HUMAN";
  control: MappedControl | null;
  citation: Citation | null;
}

export interface Rcm {
  id: string;
  circular_id: string;
  status: "DRAFT" | "PUBLISHED";
  model_name: string | null;
  created_at: string;
  published_at: string | null;
  reviewed_by_name: string | null;
  editable: boolean;
  rows: RcmRow[];
  covered: number;
  partial: number;
  gaps: number;
  citations_verified: number;
  citations_total: number;
}

export interface RcmRunAccepted {
  circular_id: string;
  queued: boolean;
  detail: string;
}

export type ItemStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "SUBMITTED" | "CLOSED";

export interface TrackedItem {
  id: string;
  circular_id: string;
  circular_ref: string | null;
  circular_title: string | null;
  description: string;
  status: ItemStatus;
  priority: PriorityName;
  source: "AI" | "HUMAN";
  due_date: string | null;
  owner: { id: string; full_name: string; email: string } | null;
  owner_function_code: string | null;
  owner_function_name: string | null;
  evidence_url: string | null;
  closure_note: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  last_reminder_at: string | null;
  created_at: string;
  /** Derived from the due date — never a stored status. */
  is_overdue: boolean;
  days_until_due: number | null;
  /** The only moves the API will accept next; the UI offers exactly these. */
  allowed_transitions: ItemStatus[];
}

export interface TrackerStats {
  total: number;
  open: number;
  in_progress: number;
  blocked: number;
  submitted: number;
  closed: number;
  overdue: number;
  due_soon: number;
  unassigned: number;
}

export interface SweepResult {
  checked: number;
  newly_overdue: number;
  reminded: number;
  detail: string;
}

export interface AuditEntry {
  seq: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  actor_kind: "HUMAN" | "AI" | "SYSTEM";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

export interface ChainStatus {
  total: number;
  intact: boolean;
  broken_at_seq: number | null;
  detail: string;
}

/** Only these roles may approve a draft — mirrors the API's own guard. */
export const CAN_PUBLISH: RoleName[] = ["reviewer", "owner", "admin"];

export const api = {
  health: () => request<Health>("/health"),
  stats: () => request<LibraryStats>("/api/v1/library/stats"),
  functions: () => request<FunctionOut[]>("/api/v1/library/functions"),
  controls: () => request<ControlOut[]>("/api/v1/library/controls"),
  kcis: () => request<KciWithControl[]>("/api/v1/library/kcis"),

  circulars: () => request<CircularSummary[]>("/api/v1/circulars"),
  circular: (id: string) => request<CircularDetail>(`/api/v1/circulars/${id}`),
  uploadCircular: (file: File, source: CircularSourceName = "RBI") => {
    const body = new FormData();
    body.append("file", file);
    body.append("source", source);
    return request<CircularDetail>("/api/v1/circulars", { method: "POST", body });
  },
  patchCircular: (id: string, changes: Partial<Pick<CircularSummary, "title" | "ref_no">>) =>
    request<CircularDetail>(`/api/v1/circulars/${id}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  retryCircular: (id: string) =>
    request<CircularDetail>(`/api/v1/circulars/${id}/retry`, { method: "POST" }),
  deleteCircular: (id: string) =>
    request<void>(`/api/v1/circulars/${id}`, { method: "DELETE" }),
  ocrStatus: () => request<OcrStatus>("/api/v1/circulars/ocr-status"),

  login: (email: string, password: string) =>
    request<TokenResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/api/v1/auth/me"),

  editAnalysis: (
    analysisId: string,
    changes: Partial<Pick<Analysis, "summary" | "risk_rating" | "risk_reasoning">>,
  ) =>
    request<Analysis>(`/api/v1/analyses/${analysisId}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  publish: (analysisId: string) =>
    request<PublishResult>(`/api/v1/analyses/${analysisId}/publish`, { method: "POST" }),
  addFunction: (analysisId: string, code: string, reasoning?: string) =>
    request<Analysis>(`/api/v1/analyses/${analysisId}/functions`, {
      method: "POST",
      body: JSON.stringify({ code, reasoning: reasoning ?? null }),
    }),
  removeFunction: (analysisId: string, code: string) =>
    request<Analysis>(`/api/v1/analyses/${analysisId}/functions/${code}`, {
      method: "DELETE",
    }),
  addActionItem: (
    circularId: string,
    payload: {
      description: string;
      priority: PriorityName;
      owner_function_code: string | null;
      due_date: string | null;
    },
  ) =>
    request<Analysis>(`/api/v1/circulars/${circularId}/action-items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editActionItem: (
    itemId: string,
    changes: Partial<{
      description: string;
      priority: PriorityName;
      owner_function_code: string | null;
      due_date: string | null;
    }>,
  ) =>
    request<ActionItem>(`/api/v1/action-items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  deleteActionItem: (itemId: string) =>
    request<void>(`/api/v1/action-items/${itemId}`, { method: "DELETE" }),

  rcm: (circularId: string) => request<Rcm | null>(`/api/v1/circulars/${circularId}/rcm`),
  buildRcm: (circularId: string) =>
    request<RcmRunAccepted>(`/api/v1/circulars/${circularId}/rcm`, { method: "POST" }),
  addRcmRow: (
    circularId: string,
    payload: {
      risk_text: string;
      control_text: string;
      coverage: CoverageName;
      mapped_control_code: string | null;
    },
  ) =>
    request<Rcm>(`/api/v1/circulars/${circularId}/rcm/rows`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  editRcmRow: (
    rowId: string,
    changes: Partial<{
      risk_text: string;
      control_text: string;
      coverage: CoverageName;
      reasoning: string;
      mapped_control_code: string | null;
    }>,
  ) =>
    request<Rcm>(`/api/v1/rcm-rows/${rowId}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  deleteRcmRow: (rowId: string) =>
    request<void>(`/api/v1/rcm-rows/${rowId}`, { method: "DELETE" }),
  publishRcm: (rcmId: string) =>
    request<PublishResult>(`/api/v1/rcms/${rcmId}/publish`, { method: "POST" }),

  users: () => request<User[]>("/api/v1/auth/users"),
  trackedItems: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params);
    return request<TrackedItem[]>(`/api/v1/action-items?${q}`);
  },
  trackerStats: () => request<TrackerStats>("/api/v1/action-items/stats"),
  assignItem: (
    itemId: string,
    changes: Partial<{
      owner_id: string | null;
      due_date: string | null;
      priority: PriorityName;
      description: string;
      owner_function_code: string | null;
    }>,
  ) =>
    request<TrackedItem>(`/api/v1/action-items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    }),
  moveItem: (itemId: string, status: ItemStatus, note?: string) =>
    request<TrackedItem>(`/api/v1/action-items/${itemId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note ?? null }),
    }),
  closeItem: (itemId: string, evidence: { evidence_url?: string; closure_note?: string }) =>
    request<TrackedItem>(`/api/v1/action-items/${itemId}/close`, {
      method: "POST",
      body: JSON.stringify(evidence),
    }),
  runSweep: () => request<SweepResult>("/api/v1/action-items/sweep", { method: "POST" }),

  auditTrail: (params: { entity_id?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.entity_id) q.set("entity_id", params.entity_id);
    q.set("limit", String(params.limit ?? 200));
    return request<AuditEntry[]>(`/api/v1/audit?${q}`);
  },
  auditVerify: () => request<ChainStatus>("/api/v1/audit/verify"),

  llmStatus: () => request<LlmStatus>("/api/v1/llm/status"),
  analysis: (circularId: string) =>
    request<Analysis | null>(`/api/v1/circulars/${circularId}/analysis`),
  analyze: (circularId: string) =>
    request<AnalysisRunAccepted>(`/api/v1/circulars/${circularId}/analyze`, {
      method: "POST",
    }),
  circularPdfUrl: (id: string) => `${BASE}/api/v1/circulars/${id}/pdf`,
};
