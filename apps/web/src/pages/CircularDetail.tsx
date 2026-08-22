import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AnalysisPanel from "../components/AnalysisPanel";
import HighlightedText from "../components/HighlightedText";
import RcmPanel from "../components/RcmPanel";
import StatusBadge from "../components/StatusBadge";
import {
  api,
  type Analysis,
  type CircularDetail as Detail,
  type Citation,
  type ControlOut,
  type FunctionOut,
  type LlmStatus,
  type Rcm,
  type TextSource,
} from "../lib/api";
import { usePolling } from "../lib/usePolling";

const SOURCE_LABEL: Record<TextSource, string> = {
  text_layer: "text layer",
  ocr: "read by OCR",
  empty: "no text found",
};

export default function CircularDetail() {
  const { id = "" } = useParams();
  const [doc, setDoc] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [llm, setLlm] = useState<LlmStatus | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [showText, setShowText] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [functions, setFunctions] = useState<FunctionOut[]>([]);
  const [controls, setControls] = useState<ControlOut[]>([]);
  const [rcm, setRcm] = useState<Rcm | null>(null);
  const [building, setBuilding] = useState(false);
  const [tab, setTab] = useState<"analysis" | "rcm">("analysis");

  // Clicking a claim's source has to reveal the text before it can scroll to it.
  function selectCitation(citation: Citation) {
    setActiveCitation(citation);
    setShowText(true);
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

  // The matrix is built in the worker, so keep asking until rows appear.
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
          break;
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuilding(false);
      load();
    }
  }

  const inFlight = doc?.status === "PARSING" || doc?.status === "ANALYZING";
  usePolling(load, inFlight);

  // Once text is available but nothing has been analysed, the reader wants the
  // extracted text. Once there is an analysis, that is the headline — so collapse it.
  useEffect(() => {
    if (doc && !analysis) setShowText(true);
  }, [doc, analysis]);

  async function analyse() {
    setAnalysing(true);
    setError("");
    try {
      const accepted = await api.analyze(id);
      if (!accepted.queued && accepted.status !== "ANALYZED") setError(accepted.detail);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAnalysing(false);
    }
  }

  async function retry() {
    setRetrying(true);
    setError("");
    try {
      setDoc(await api.retryCircular(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  }

  // Slice the stored text by the page map. This is the visible proof that the
  // character offsets are real: every page below is `raw_text[start:end]`.
  const pages = useMemo(() => {
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

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !doc?.raw_text) return null;
    const found: { page: number; offset: number }[] = [];
    const hay = doc.raw_text.toLowerCase();
    let at = hay.indexOf(q);
    while (at !== -1 && found.length < 50) {
      const span = doc.page_map?.find((s) => at >= s.char_start && at < s.char_end);
      found.push({ page: span?.page ?? 0, offset: at });
      at = hay.indexOf(q, at + q.length);
    }
    return found;
  }, [query, doc]);

  if (error) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-sm text-[color:var(--status-critical)]">{error}</p>
        <Link to="/circulars" className="mt-3 inline-block text-sm text-gray-600 underline">
          Back to circulars
        </Link>
      </div>
    );
  }
  if (!doc) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/circulars" className="text-sm text-gray-500 hover:text-gray-900">
          ← Circulars
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-3xl text-xl font-semibold text-gray-900">
            {doc.title || "Untitled"}
          </h1>
          <StatusBadge status={doc.status} />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-4">
        <Field label="Reference" value={doc.ref_no ?? "—"} mono />
        <Field label="Issued" value={doc.issued_date ?? "—"} mono />
        <Field label="Pages" value={String(doc.page_count ?? "—")} mono />
        <Field label="Characters" value={doc.char_count.toLocaleString()} mono />
      </section>

      {doc.parse_error && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[color:var(--status-critical)]">
            <span aria-hidden className="mr-1.5">✕</span>Text extraction failed
          </h2>
          <p className="mt-1 text-sm text-gray-700">{doc.parse_error}</p>
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retry()}
            className="mt-3 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry extraction"}
          </button>
        </div>
      )}

      {doc.status === "PARSING" && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          Reading scanned pages with OCR — a few seconds per page. This page updates itself.
          <span className="mt-1 block text-xs text-gray-400">
            Stuck here? The ARQ worker may not be running: <code>arq
            app.worker.settings.WorkerSettings</code>
          </span>
        </div>
      )}

      {ocrPages > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
          <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-warning)]">!</span>
          {ocrPages} of {doc.page_count} page{doc.page_count === 1 ? "" : "s"} had no text layer
          and {ocrPages === 1 ? "was" : "were"} read by OCR. Machine-read text can contain
          mistakes — check quotes taken from {ocrPages === 1 ? "that page" : "those pages"}.
        </div>
      )}

      {doc.analysis_error && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-[color:var(--status-warning)]">
            <span aria-hidden className="mr-1.5">!</span>AI analysis unavailable
          </h2>
          <p className="mt-1 text-sm text-gray-700">{doc.analysis_error}</p>
          <p className="mt-2 text-xs text-gray-500">
            The circular is still fully reviewable by hand — the AI is never required.
          </p>
        </div>
      )}

      {doc.status === "ANALYZING" && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          Reading the circular with {llm?.model ?? "the model"} — usually 15–40 seconds.
          This page updates itself.
        </div>
      )}

      {analysis && (
        <>
          <div className="flex gap-1 border-b border-gray-200">
            {(
              [
                ["analysis", "Analysis"],
                ["rcm", `Risk & Control Matrix${rcm ? ` (${rcm.rows.length})` : ""}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  tab === key
                    ? "border-gray-900 font-medium text-gray-900"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
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
      )}

      <div className="flex flex-wrap items-center gap-3">
        {doc.status !== "FAILED" && (
          <button
            type="button"
            disabled={analysing || inFlight || !llm?.configured}
            onClick={() => void analyse()}
            title={llm?.configured ? undefined : llm?.detail}
            className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {analysing || doc.status === "ANALYZING"
              ? "Analysing…"
              : analysis
                ? "Re-run analysis"
                : "Analyse with AI"}
          </button>
        )}
        <a
          href={api.circularPdfUrl(doc.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900"
        >
          Open original PDF
        </a>
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900"
        >
          {showText ? "Hide extracted text" : "Show extracted text"}
        </button>
        {activeCitation && (
          <button
            type="button"
            onClick={() => setActiveCitation(null)}
            className="text-sm text-gray-500 underline hover:text-gray-900"
          >
            Clear highlight
          </button>
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a phrase in the text…"
          aria-label="Find a phrase in the extracted text"
          className="w-72 rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-500"
        />
        {hits && (
          <span className="text-sm text-gray-600">
            {hits.length === 0 ? (
              "No match"
            ) : (
              <>
                {hits.length} match{hits.length > 1 && "es"} · page
                {hits.length > 1 && "s"}{" "}
                <span className="font-medium tabular-nums text-gray-900">
                  {[...new Set(hits.map((h) => h.page))].join(", ")}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      <section className={`space-y-4 ${showText ? "" : "hidden"}`}>
        {pages.map((page) => (
          <article key={page.page} className="rounded-lg border border-gray-200 bg-white">
            <header className="flex items-baseline justify-between border-b border-gray-100 px-5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Page {page.page}
                <span
                  className={`ml-2 font-normal normal-case tracking-normal ${
                    page.source === "text_layer" ? "text-gray-400" : "text-gray-700"
                  }`}
                >
                  {SOURCE_LABEL[page.source]}
                </span>
              </span>
              <span className="text-xs tabular-nums text-gray-400">
                chars {page.char_start.toLocaleString()}–{page.char_end.toLocaleString()}
              </span>
            </header>
            <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed text-gray-800">
              <HighlightedText
                text={page.text}
                pageStart={page.char_start}
                charStart={activeCitation?.char_start ?? null}
                charEnd={activeCitation?.char_end ?? null}
                scrollKey={`${activeCitation?.target_kind}:${activeCitation?.target_ref}`}
              />
            </pre>
          </article>
        ))}
        {pages.length === 0 && !doc.parse_error && (
          <p className="text-sm text-gray-500">No text stored for this circular.</p>
        )}
      </section>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 text-sm text-gray-900 ${mono ? "tabular-nums" : ""}`}>{value}</div>
    </div>
  );
}
