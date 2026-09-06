import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Grid2x2,
  Loader2,
  RotateCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import AnalysisPanel from "@/components/AnalysisPanel";
import Callout from "@/components/Callout";
import DocumentPane, { type DocPage } from "@/components/DocumentPane";
import RcmPanel from "@/components/RcmPanel";
import StatusBadge from "@/components/StatusBadge";
import { StatusGlyph } from "@/components/StatusGlyph";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  type Analysis,
  type CircularDetail as Detail,
  type Citation,
  type ControlOut,
  type FunctionOut,
  type LlmStatus,
  type Rcm,
} from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { cn, isoDay } from "@/lib/utils";

/** Elapsed seconds since the caller says work started. The AI leg can legitimately
 *  run for minutes once the retry/fallback chain kicks in, so a static "usually
 *  15–40 seconds" reads as a hang. A ticking clock reads as progress. */
function useElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [active]);
  return seconds;
}

/** A named-stage progress strip for work that happens in the worker. The stages are
 *  the real pipeline; the elapsed clock is what proves it is still moving. */
function WorkingPanel({
  title,
  stages,
  seconds,
  note,
}: {
  title: string;
  stages: string[];
  seconds: number;
  note?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-up space-y-3 rounded-xl border border-brand-line/25 bg-brand-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Loader2 aria-hidden className="size-4 animate-spin text-brand" />
          {title}
        </p>
        <span className="font-mono text-xs tabular-nums text-brand">{seconds}s elapsed</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {stages.map((stage) => (
          <span
            key={stage}
            className="rounded-md border border-brand-line/25 bg-card/70 px-2 py-0.5 text-2xs font-medium text-muted-foreground"
          >
            {stage}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-2/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>

      {note && <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  );
}

/** One fact in the masthead strip. */
function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default function CircularDetail() {
  const { id = "" } = useParams();
  const [doc, setDoc] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [functions, setFunctions] = useState<FunctionOut[]>([]);
  const [controls, setControls] = useState<ControlOut[]>([]);
  const [rcm, setRcm] = useState<Rcm | null>(null);
  const [building, setBuilding] = useState(false);
  const [tab, setTab] = useState<"analysis" | "rcm">("analysis");
  // The document pane is open by default — it is half the point of this screen.
  const [showDoc, setShowDoc] = useState(true);

  // Selecting a claim's source must reveal the pane if the reviewer collapsed it,
  // otherwise the citation silently highlights something nobody can see.
  function selectCitation(citation: Citation) {
    setActiveCitation(citation);
    setShowDoc(true);
  }

  const load = useCallback(() => {
    api
      .circular(id)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
    api.analysis(id).then(setAnalysis).catch(() => setAnalysis(null));
    api.rcm(id).then(setRcm).catch(() => setRcm(null));
  }, [id]);

  useEffect(load, [load]);
  useEffect(() => {
    api.llmStatus().then(setLlm).catch(() => setLlm(null));
    api.functions().then(setFunctions).catch(() => setFunctions([]));
    api.controls().then(setControls).catch(() => setControls([]));
  }, []);

  usePolling(load, building && !rcm, 3000);

  async function buildRcm() {
    setBuilding(true);
    setError("");
    try {
      await api.buildRcm(id);
      // Poll until the worker has written rows, then stop.
      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const next = await api.rcm(id);
        if (next && next.rows.length > 0 && next.model_name) {
          setRcm(next);
          toast.success("Matrix built", {
            description: `${next.rows.length} risks · ${next.gaps} with no existing control.`,
          });
          break;
        }
      }
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Could not build the matrix", { description: message });
    } finally {
      setBuilding(false);
      load();
    }
  }

  const inFlight = doc?.status === "PARSING" || doc?.status === "ANALYZING";
  usePolling(load, inFlight);

  const analysingElapsed = useElapsed(doc?.status === "ANALYZING");
  const parsingElapsed = useElapsed(doc?.status === "PARSING");
  const buildingElapsed = useElapsed(building);

  async function analyse() {
    setAnalysing(true);
    setError("");
    try {
      const accepted = await api.analyze(id);
      if (!accepted.queued && accepted.status !== "ANALYZED") {
        setError(accepted.detail);
        toast.error("The AI could not be started", { description: accepted.detail });
      }
      load();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Analysis failed to start", { description: message });
    } finally {
      setAnalysing(false);
    }
  }

  async function retry() {
    setRetrying(true);
    setError("");
    try {
      setDoc(await api.retryCircular(id));
      toast.success("Retrying text extraction");
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Retry failed", { description: message });
    } finally {
      setRetrying(false);
    }
  }

  // Slice the stored text by the page map. This is the visible proof that the
  // character offsets are real: every page below is `raw_text[start:end]`.
  const pages = useMemo<DocPage[]>(() => {
    if (!doc?.raw_text || !doc.page_map) return [];
    return doc.page_map.map((span) => ({
      ...span,
      text: doc.raw_text!.slice(span.char_start, span.char_end),
    }));
  }, [doc]);

  const ocrPages = useMemo(
    () => doc?.page_map?.filter((s) => s.source === "ocr").length ?? 0,
    [doc],
  );

  // One verification figure for the masthead, from whichever view is showing.
  const cites =
    tab === "rcm" && rcm
      ? { verified: rcm.citations_verified, total: rcm.citations_total }
      : analysis
        ? { verified: analysis.citations_verified, total: analysis.citations_total }
        : null;

  if (error && !doc) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Callout tone="critical" title="This circular could not be loaded">
          {error}
        </Callout>
        <Button variant="outline" size="sm" asChild className="mt-4">
          <Link to="/circulars">
            <ArrowLeft />
            Back to circulars
          </Link>
        </Button>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="space-y-4 py-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-[60vh]" />
          <Skeleton className="hidden h-[60vh] lg:block" />
        </div>
      </div>
    );
  }

  const hasText = pages.length > 0;

  return (
    // A full-height workspace: the masthead is fixed and each pane scrolls on its
    // own, so following a citation never scrolls the claim out of view.
    <div className="flex flex-col gap-4 lg:h-[calc(100vh-3.5rem-2rem)]">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-4 pt-3.5">
          <div className="min-w-0 flex-1">
            <Link
              to="/circulars"
              className="inline-flex items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-brand"
            >
              <ArrowLeft aria-hidden className="size-3.5" />
              Circulars
            </Link>

            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              {doc.ref_no && (
                <span className="rounded-md bg-brand-surface px-2 py-0.5 font-mono text-xs font-semibold text-brand ring-1 ring-inset ring-brand-line/25">
                  {doc.ref_no}
                </span>
              )}
              <StatusBadge status={doc.status} />
            </div>

            <h1 className="mt-2 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-foreground">
              {doc.title || "Untitled"}
            </h1>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {doc.status !== "FAILED" && (
              <Button
                disabled={analysing || inFlight || !llm?.configured}
                onClick={() => void analyse()}
                title={llm?.configured ? undefined : llm?.detail}
              >
                {analysing || doc.status === "ANALYZING" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {analysing || doc.status === "ANALYZING"
                  ? "Analysing…"
                  : analysis
                    ? "Re-run analysis"
                    : "Analyse with AI"}
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href={api.circularPdfUrl(doc.id)} target="_blank" rel="noreferrer">
                <ExternalLink />
                Original PDF
              </a>
            </Button>
          </div>
        </div>

        {/* Meta strip — the document's facts, plus the one number that matters. */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-border bg-muted/40 px-5 py-2.5">
          <Meta label="Issued" value={doc.issued_date ?? "—"} />
          {/* Two different dates, and confusing them matters: "Issued" is the
              regulator's date on the circular itself, this is when we took it in.
              A 2021 circular uploaded today is a backlog item, not a new obligation. */}
          <Meta
            label="Uploaded"
            value={
              <span title={new Date(doc.created_at).toLocaleString()}>
                {isoDay(doc.created_at)}
              </span>
            }
          />
          <Meta label="Pages" value={doc.page_count ?? "—"} />
          <Meta label="Characters" value={doc.char_count.toLocaleString()} />
          {ocrPages > 0 && (
            <Meta
              label="Machine-read"
              value={<span className="text-status-warning">{ocrPages} pages</span>}
            />
          )}
          {cites && cites.total > 0 && (
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
              <StatusGlyph tone={cites.verified === cites.total ? "good" : "warning"} />
              <span className="text-sm text-foreground">
                <span className="font-semibold tabular-nums">
                  {cites.verified}/{cites.total}
                </span>{" "}
                <span className="text-muted-foreground">claims grounded</span>
              </span>
            </div>
          )}
        </div>
      </header>

      {/* ── Blocking / transient states ──────────────────────────────────── */}
      {error && doc && <Callout tone="critical">{error}</Callout>}

      {doc.parse_error && (
        <Callout
          tone="critical"
          title="Text extraction failed"
          action={
            <Button variant="outline" size="sm" disabled={retrying} onClick={() => void retry()}>
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}
              {retrying ? "Retrying…" : "Retry extraction"}
            </Button>
          }
        >
          {doc.parse_error}
        </Callout>
      )}

      {doc.analysis_error && (
        <Callout tone="warning" title="AI analysis unavailable">
          {doc.analysis_error}
          <p className="mt-1.5 text-xs">
            The circular is still fully reviewable by hand — the AI is never required.
          </p>
        </Callout>
      )}

      {/* ── The two-pane workspace ───────────────────────────────────────── */}
      <div
        className={cn(
          "grid min-h-0 flex-1 gap-4",
          !hasText
            ? "lg:grid-cols-1"
            : showDoc
              ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]"
              : "lg:grid-cols-[minmax(0,1fr)_auto]",
        )}
      >
        {/* Left — the reviewer's work */}
        <div className="scroll-slim flex min-h-0 min-w-0 flex-col gap-4 lg:overflow-y-auto lg:pr-1">
          {doc.status === "PARSING" && (
            <WorkingPanel
              title="Reading scanned pages with OCR"
              stages={["Rasterising pages", "Running OCR", "Assembling page offsets"]}
              seconds={parsingElapsed}
              note={
                <>
                  A few seconds per page. Stuck here? The ARQ worker may not be running:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono">
                    arq app.worker.settings.WorkerSettings
                  </code>
                </>
              }
            />
          )}

          {doc.status === "ANALYZING" && (
            <WorkingPanel
              title={`Reading the circular with ${llm?.model ?? "the model"}`}
              stages={[
                "Sending the text",
                "Extracting obligations",
                "Grounding every quote",
                "Writing the draft",
              ]}
              seconds={analysingElapsed}
              note="Usually 20–70 seconds. A free-tier spike can push it past four minutes once the retry and fallback chain kicks in — that is the system working, not hanging."
            />
          )}

          {building && !rcm && (
            <WorkingPanel
              title="Matching risks against the control library"
              stages={[
                `Loading all ${controls.length} controls`,
                "Matching each risk",
                "Grounding every quote",
              ]}
              seconds={buildingElapsed}
            />
          )}

          {analysis ? (
            <>
              <div
                role="tablist"
                aria-label="Analysis views"
                className="flex w-fit shrink-0 gap-1 rounded-lg border border-border bg-muted/60 p-1"
              >
                {(
                  [
                    ["analysis", "Analysis", FileText],
                    ["rcm", `Risk & Control Matrix${rcm ? ` (${rcm.rows.length})` : ""}`, Grid2x2],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={tab === key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                      tab === key
                        ? "bg-card text-brand shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon aria-hidden className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {tab === "analysis" ? (
                <AnalysisPanel
                  analysis={analysis}
                  functions={functions}
                  activeCitation={activeCitation}
                  onSelectCitation={selectCitation}
                  onChanged={load}
                />
              ) : (
                <RcmPanel
                  circularId={id}
                  rcm={rcm}
                  controls={controls}
                  building={building}
                  canBuild={!!analysis}
                  activeCitation={activeCitation}
                  onSelectCitation={selectCitation}
                  onBuild={() => void buildRcm()}
                  onChanged={load}
                />
              )}
            </>
          ) : (
            !inFlight && (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-brand-surface ring-1 ring-inset ring-brand-line/25">
                  <Sparkles aria-hidden className="size-5 text-brand" />
                </span>
                <h2 className="mt-4 text-base font-semibold text-foreground">Not analysed yet</h2>
                <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                  The text is extracted and every character offset is stored. Run the model to
                  get a summary, a risk rating and the obligations this circular creates — each
                  one carrying the exact line it came from.
                </p>
                {doc.status !== "FAILED" && (
                  <Button
                    onClick={() => void analyse()}
                    disabled={analysing || !llm?.configured}
                    title={llm?.configured ? undefined : llm?.detail}
                    className="mt-5"
                  >
                    {analysing ? <Loader2 className="animate-spin" /> : <Sparkles />}
                    Analyse with AI
                  </Button>
                )}
              </div>
            )
          )}
        </div>

        {/* Right — the evidence, always beside the claim */}
        {hasText && (
          <DocumentPane
            pages={pages}
            pageCount={doc.page_count}
            ocrPages={ocrPages}
            activeCitation={activeCitation}
            onClearCitation={() => setActiveCitation(null)}
            collapsed={!showDoc}
            onToggleCollapse={() => setShowDoc((v) => !v)}
            className="h-[70vh] min-w-0 lg:h-auto"
          />
        )}
      </div>
    </div>
  );
}
