import { useCallback, useEffect, useState } from "react";
import { api, type AuditEntry, type ChainStatus } from "../lib/api";

const ACTOR_STYLE: Record<AuditEntry["actor_kind"], string> = {
  HUMAN: "bg-gray-900 text-white",
  AI: "bg-gray-200 text-gray-700",
  SYSTEM: "bg-gray-100 text-gray-500",
};

export default function Audit() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.auditTrail({ limit: 200 }), api.auditVerify()])
      .then(([entries, status]) => {
        setRows(entries);
        setChain(status);
        setError("");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function recheck() {
    setChecking(true);
    try {
      setChain(await api.auditVerify());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Audit trail</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every AI suggestion and every human decision, append-only. Each entry's hash covers
          the one before it, so altering or deleting any entry breaks every hash after it.
        </p>
      </div>

      {error && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-[color:var(--status-critical)]">
          <span aria-hidden className="mr-1.5 font-bold">✕</span>
          {error}
        </div>
      )}

      {chain && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4">
          <p className="text-sm text-gray-800">
            <span
              aria-hidden
              className="mr-1.5 font-bold"
              style={{
                color: chain.intact ? "var(--status-good)" : "var(--status-critical)",
              }}
            >
              {chain.intact ? "✓" : "✕"}
            </span>
            {chain.detail}
          </p>
          <button
            type="button"
            onClick={() => void recheck()}
            disabled={checking}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 disabled:opacity-50"
          >
            {checking ? "Verifying…" : "Verify chain"}
          </button>
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-5 py-2.5 font-medium">#</th>
                <th className="px-5 py-2.5 font-medium">When</th>
                <th className="px-5 py-2.5 font-medium">By</th>
                <th className="px-5 py-2.5 font-medium">Action</th>
                <th className="px-5 py-2.5 font-medium">What changed</th>
                <th className="px-5 py-2.5 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.seq}
                  className={`border-b border-gray-100 align-top last:border-0 ${
                    chain && !chain.intact && chain.broken_at_seq === row.seq
                      ? "bg-red-50"
                      : ""
                  }`}
                >
                  <td className="px-5 py-3 tabular-nums text-gray-400">{row.seq}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-xs text-gray-500">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACTOR_STYLE[row.actor_kind]}`}
                    >
                      {row.actor_kind}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-800">{row.action}</td>
                  <td className="px-5 py-3">
                    <Change before={row.before} after={row.after} />
                  </td>
                  <td
                    className="px-5 py-3 font-mono text-xs text-gray-400"
                    title={`hash ${row.hash}\nprev ${row.prev_hash ?? "—"}`}
                  >
                    {row.hash.slice(0, 10)}…
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-6 text-sm text-gray-500">
                    Nothing recorded yet. Analyse and approve a circular to populate the trail.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Change({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return <span className="text-gray-400">—</span>;

  return (
    <dl className="space-y-0.5 text-xs">
      {keys.slice(0, 6).map((key) => (
        <div key={key} className="flex flex-wrap gap-1.5">
          <dt className="text-gray-500">{key}:</dt>
          {before && key in before && (
            <dd className="text-gray-400 line-through">{format(before[key])}</dd>
          )}
          <dd className="text-gray-800">{format(after?.[key])}</dd>
        </div>
      ))}
      {keys.length > 6 && <div className="text-gray-400">+{keys.length - 6} more</div>}
    </dl>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  const text = String(value);
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}
