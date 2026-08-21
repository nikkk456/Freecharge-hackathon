import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { api, type CircularDetail as Detail } from "../lib/api";

export default function CircularDetail() {
  const { id = "" } = useParams();
  const [doc, setDoc] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api
      .circular(id)
      .then(setDoc)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Slice the stored text by the page map. This is the visible proof that the
  // character offsets are real: every page below is `raw_text[start:end]`.
  const pages = useMemo(() => {
    if (!doc?.raw_text || !doc.page_map) return [];
    return doc.page_map.map((span) => ({
      ...span,
      text: doc.raw_text!.slice(span.char_start, span.char_end),
    }));
  }, [doc]);

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
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <a
          href={api.circularPdfUrl(doc.id)}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900"
        >
          Open original PDF
        </a>
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

      <section className="space-y-4">
        {pages.map((page) => (
          <article key={page.page} className="rounded-lg border border-gray-200 bg-white">
            <header className="flex items-baseline justify-between border-b border-gray-100 px-5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Page {page.page}
              </span>
              <span className="text-xs tabular-nums text-gray-400">
                chars {page.char_start.toLocaleString()}–{page.char_end.toLocaleString()}
              </span>
            </header>
            <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-4 font-sans text-sm leading-relaxed text-gray-800">
              {page.text}
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
