// Typed API client. In dev, Vite proxies /api and /health to FastAPI (vite.config.ts).
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // FormData must set its own Content-Type so the multipart boundary is included.
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
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

export interface KciOut {
  id: string;
  code: string;
  name: string;
  target: string | null;
  current_value: string | null;
  status: RagStatus;
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

export interface ImpactedFunction {
  code: string;
  name: string;
  confidence: number | null;
  reasoning: string | null;
  source: "AI" | "HUMAN";
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
  needs_review: boolean;
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

  llmStatus: () => request<LlmStatus>("/api/v1/llm/status"),
  analysis: (circularId: string) =>
    request<Analysis | null>(`/api/v1/circulars/${circularId}/analysis`),
  analyze: (circularId: string) =>
    request<AnalysisRunAccepted>(`/api/v1/circulars/${circularId}/analyze`, {
      method: "POST",
    }),
  circularPdfUrl: (id: string) => `${BASE}/api/v1/circulars/${id}/pdf`,
};
