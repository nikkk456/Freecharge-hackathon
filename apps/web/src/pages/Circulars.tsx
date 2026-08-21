import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../components/StatusBadge";
import { api, type CircularSummary } from "../lib/api";

export default function Circulars() {
  const [rows, setRows] = useState<CircularSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
  }, [refresh]);

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
          Upload a regulatory PDF. The text is extracted and stored with per-page character
          offsets — the basis for citing an exact source line later.
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
        <p className="mt-3 text-xs text-gray-400">PDF with a text layer · up to 25 MB</p>
      </div>

      {error && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-[color:var(--status-critical)]">
          <span aria-hidden className="mr-1.5 font-bold">✕</span>
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Uploaded {rows.length > 0 && <span className="text-gray-400">({rows.length})</span>}
          </h2>
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
                        <div className="mt-1 text-xs text-[color:var(--status-critical)]">
                          {c.parse_error}
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
