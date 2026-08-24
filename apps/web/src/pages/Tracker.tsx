import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ItemStatusChip, { OverdueChip, itemStatusLabel } from "../components/ItemStatusChip";
import StatTile from "../components/StatTile";
import {
  api,
  CAN_PUBLISH,
  type ItemStatus,
  type SweepResult,
  type TrackedItem,
  type TrackerStats,
  type User,
} from "../lib/api";
import { useAuth } from "../lib/auth";

type Filter = "all" | "mine" | "overdue" | "unassigned" | ItemStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "CLOSED", label: "Closed" },
];

export default function Tracker() {
  const { user, can } = useAuth();
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  const params = useMemo((): Record<string, string> => {
    if (filter === "all") return {};
    if (filter === "overdue") return { overdue: "true" };
    if (filter === "unassigned") return { unassigned: "true" };
    if (filter === "mine") return user ? { owner_id: user.id } : {};
    return { status: filter };
  }, [filter, user]);

  const load = useCallback(() => {
    Promise.all([api.trackedItems(params), api.trackerStats()])
      .then(([rows, counts]) => {
        setItems(rows);
        setStats(counts);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(load, [load]);
  useEffect(() => {
    api.users().then(setUsers).catch(() => setUsers([]));
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Action tracker</h1>
        <p className="mt-1 text-sm text-gray-600">
          Every obligation extracted from a circular, with an owner and a deadline. Nothing
          closes without evidence and a second pair of eyes.
        </p>
      </div>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Open" value={stats.open} hint="Not started" />
          <StatTile label="In progress" value={stats.in_progress} hint="Being worked on" />
          <StatTile
            label="Overdue"
            value={stats.overdue}
            hint={stats.overdue > 0 ? "Past the deadline" : "Nothing late"}
          />
          <StatTile label="Closed" value={stats.closed} hint="Signed off with evidence" />
        </section>
      )}

      {error && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-[color:var(--status-critical)]">
          <span aria-hidden className="mr-1.5 font-bold">✕</span>
          {error}
        </div>
      )}

      {sweep && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-700">
          <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-warning)]">
            !
          </span>
          {sweep.detail}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`rounded px-2.5 py-1 text-sm ${
                filter === option.key
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {option.label}
              {option.key === "overdue" && stats && stats.overdue > 0 && (
                <span className="ml-1.5 tabular-nums opacity-70">{stats.overdue}</span>
              )}
            </button>
          ))}
        </div>
        {can(...CAN_PUBLISH) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => setSweep(await api.runSweep()))}
            title="The same check the scheduled job runs every morning at 08:00"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 disabled:opacity-50"
          >
            Run overdue check
          </button>
        )}
      </div>

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-5 py-2.5 font-medium">What must be done</th>
                <th className="px-5 py-2.5 font-medium">Owner</th>
                <th className="px-5 py-2.5 font-medium">Due</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
                <th className="px-5 py-2.5 font-medium">Move to</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-5 py-3">
                    <div className={item.status === "CLOSED" ? "text-gray-500" : "text-gray-900"}>
                      {item.description}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                      <Link
                        to={`/circulars/${item.circular_id}`}
                        className="underline decoration-gray-300 underline-offset-2 hover:decoration-gray-900"
                      >
                        {item.circular_ref ?? item.circular_title ?? "circular"}
                      </Link>
                      {item.owner_function_code && (
                        <span>
                          · {item.owner_function_code} {item.owner_function_name}
                        </span>
                      )}
                      {item.source === "HUMAN" && <span>· added by a reviewer</span>}
                    </div>
                    {item.status === "CLOSED" && (
                      <div className="mt-1.5 text-xs text-gray-500">
                        Signed off by {item.closed_by_name}
                        {item.evidence_url && (
                          <>
                            {" · "}
                            <a
                              href={item.evidence_url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline"
                            >
                              evidence
                            </a>
                          </>
                        )}
                        {item.closure_note && ` · ${item.closure_note}`}
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <select
                      aria-label={`Owner for: ${item.description.slice(0, 40)}`}
                      value={item.owner?.id ?? ""}
                      disabled={busy || item.status === "CLOSED"}
                      onChange={(e) =>
                        void run(() =>
                          api.assignItem(item.id, { owner_id: e.target.value || null }),
                        )
                      }
                      className="w-36 rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-gray-900 disabled:opacity-60"
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className="px-5 py-3">
                    <input
                      type="date"
                      aria-label={`Due date for: ${item.description.slice(0, 40)}`}
                      value={item.due_date ?? ""}
                      disabled={busy || item.status === "CLOSED"}
                      onChange={(e) =>
                        void run(() =>
                          api.assignItem(item.id, { due_date: e.target.value || null }),
                        )
                      }
                      className="rounded border border-gray-300 px-1.5 py-1 text-xs tabular-nums outline-none focus:border-gray-900 disabled:opacity-60"
                    />
                    {item.is_overdue && (
                      <div className="mt-1.5">
                        <OverdueChip days={item.days_until_due} />
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <ItemStatusChip status={item.status} />
                  </td>

                  <td className="whitespace-nowrap px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {/* Exactly the moves the API will accept — the same table it
                          enforces, so the UI can never offer an illegal one. */}
                      {item.allowed_transitions
                        .filter((next) => next !== "CLOSED")
                        .map((next) => (
                          <button
                            key={next}
                            type="button"
                            disabled={busy}
                            onClick={() => void run(() => api.moveItem(item.id, next))}
                            className="rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:border-gray-900 disabled:opacity-50"
                          >
                            {itemStatusLabel(next)}
                          </button>
                        ))}
                      {item.allowed_transitions.includes("CLOSED") &&
                        (can(...CAN_PUBLISH) ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setClosing(closing === item.id ? null : item.id)}
                            className="rounded bg-gray-900 px-2 py-0.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                          >
                            Close…
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">awaiting sign-off</span>
                        ))}
                    </div>

                    {closing === item.id && (
                      <CloseForm
                        busy={busy}
                        onCancel={() => setClosing(null)}
                        onSubmit={(evidence) =>
                          void run(async () => {
                            await api.closeItem(item.id, evidence);
                            setClosing(null);
                          })
                        }
                      />
                    )}
                  </td>
                </tr>
              ))}

              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-sm text-gray-500">
                    {filter === "all"
                      ? "No action items yet. Analyse a circular and they appear here."
                      : "Nothing matches this filter."}
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-sm text-gray-500">
                    Loading…
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

function CloseForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (evidence: { evidence_url?: string; closure_note?: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  // Mirrors the API's rule so the button cannot be pressed into a 422.
  const hasEvidence = url.trim().length > 0 || note.trim().length > 0;

  return (
    <div className="mt-2 w-64 space-y-2 rounded border border-gray-200 bg-gray-50 p-2">
      <p className="text-xs text-gray-600">Closing needs evidence.</p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link to the proof"
        aria-label="Evidence link"
        className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="…or describe what was done"
        aria-label="Closure note"
        rows={2}
        className="w-full resize-y rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !hasEvidence}
          onClick={() =>
            onSubmit({ evidence_url: url.trim() || undefined, closure_note: note.trim() || undefined })
          }
          className="rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          Close item
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-500 underline hover:text-gray-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
