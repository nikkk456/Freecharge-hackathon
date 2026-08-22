import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { api, type CircularSummary, type OcrStatus } from "../lib/api";
import { usePolling } from "../lib/usePolling";

export default function Circulars() {
  const [rows, setRows] = useState<CircularSummary[]>([]);
  const [ocr, setOcr] = useState<OcrStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await api.circulars());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api.ocrStatus().then(setOcr).catch(() => setOcr(null));
  }, [refresh]);

  // A scanned upload is OCR'd in the worker, so the row finishes after the
  // response. Keep asking until nothing is mid-flight.
  const working = rows.some((r) => r.status === "PARSING" || r.status === "UPLOADED");
  usePolling(() => void refresh(), working);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      // Sequential, not Promise.all: a shared upload limit and clearer failures.
      for (const file of Array.from(files)) {
        await api.uploadCircular(file);
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function retry(id: string) {
    setRetrying(id);
    setError("");
    try {
      await api.retryCircular(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(null);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Delete “${label}”? This removes the stored PDF too.`)) return;
    try {
      await api.deleteCircular(id);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Circulars</h1>
        <p className="mt-1 text-sm text-gray-600">
          Upload any regulatory PDF — typed, scanned, or a mix. Text is extracted and stored
          with per-page character offsets, the basis for citing an exact source line later.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-gray-900 bg-gray-50" : "border-gray-300 bg-white"
        }`}
      >
        <p className="text-sm text-gray-600">Drop a circular PDF here, or</p>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Choose a PDF"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
        <p className="mt-3 text-xs text-gray-400">
          Up to 25 MB · scanned pages are read by OCR
          {ocr?.ready && ocr.available_engines.length > 0 && ` (${ocr.available_engines[0]})`}
        </p>
      </div>

      {ocr && !ocr.ready && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm">
          <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-warning)]">!</span>
          <span className="font-medium text-gray-900">Scanned PDFs cannot be read.</span>{" "}
          <span className="text-gray-600">{ocr.detail}</span>
        </div>
      )}

      {error && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-[color:var(--status-critical)]">
          <span aria-hidden className="mr-1.5 font-bold">✕</span>
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Uploaded {rows.length > 0 && <span className="text-gray-400">({rows.length})</span>}
          </h2>
          {working && <span className="text-xs text-gray-500">Working…</span>}
        </div>

        {loading ? (
          <p className="px-5 py-6 text-sm text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">
            Nothing uploaded yet. Drop a circular above to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="px-5 py-2.5 font-medium">Reference</th>
                  <th className="px-5 py-2.5 font-medium">Title</th>
                  <th className="px-5 py-2.5 font-medium">Issued</th>
                  <th className="px-5 py-2.5 font-medium">Pages</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium sr-only">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gray-500">
                      {c.ref_no ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        to={`/circulars/${c.id}`}
                        className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
                      >
                        {c.title || "Untitled"}
                      </Link>
                      {c.parse_error && (
                        <div className="mt-1 max-w-md text-xs text-[color:var(--status-critical)]">
                          {c.parse_error}
                        </div>
                      )}
                      {c.status === "PARSING" && (
                        <div className="mt-1 text-xs text-gray-500">
                          Reading scanned pages — this takes a few seconds per page.
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gray-700">
                      {c.issued_date ?? "—"}
                    </td>
                    <td className="px-5 py-3 tabular-nums text-gray-700">
                      {c.page_count ?? "—"}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      {c.status === "FAILED" && (
                        <button
                          type="button"
                          disabled={retrying === c.id}
                          onClick={() => void retry(c.id)}
                          className="mr-3 text-xs text-gray-600 underline hover:text-gray-900 disabled:opacity-50"
                        >
                          {retrying === c.id ? "Retrying…" : "Retry"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(c.id, c.title || "this circular")}
                        className="text-xs text-gray-400 hover:text-[color:var(--status-critical)]"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
