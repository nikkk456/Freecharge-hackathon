import { useState } from "react";
import CitationChip from "./CitationChip";
import ConfidenceMeter from "./ConfidenceMeter";
import RiskBadge from "./RiskBadge";
import { EditableText, RiskSelector } from "./ReviewControls";
import {
  api,
  CAN_PUBLISH,
  type Analysis,
  type Citation,
  type FunctionOut,
  type PriorityName,
  type RiskRating,
} from "../lib/api";
import { useAuth } from "../lib/auth";

const PRIORITY_STYLE: Record<PriorityName, string> = {
  HIGH: "font-semibold text-gray-900",
  MEDIUM: "text-gray-700",
  LOW: "text-gray-500",
};

function sameCitation(a: Citation | null, b: Citation | null): boolean {
  return !!a && !!b && a.target_kind === b.target_kind && a.target_ref === b.target_ref;
}

export default function AnalysisPanel({
  analysis,
  functions,
  activeCitation,
  onSelectCitation,
  onChanged,
}: {
  analysis: Analysis;
  functions: FunctionOut[];
  activeCitation: Citation | null;
  onSelectCitation: (citation: Citation) => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", owner: "", priority: "MEDIUM" });

  const editable = analysis.editable;
  const allVerified =
    analysis.citations_total > 0 && analysis.citations_verified === analysis.citations_total;

  // Every mutation funnels through here so one failure path serves them all, and the
  // parent always refetches — the server is the source of truth, not local state.
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unlisted = functions.filter(
    (f) => !analysis.impacted_functions.some((i) => i.code === f.code),
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded border border-gray-200 bg-white p-3 text-sm text-[color:var(--status-critical)]">
          <span aria-hidden className="mr-1.5 font-bold">✕</span>
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">AI analysis</h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              v{analysis.version} · {analysis.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-xs text-gray-500">confidence</span>
            <ConfidenceMeter value={analysis.confidence} width={56} />
            {analysis.risk_rating && <RiskBadge rating={analysis.risk_rating} />}
            {analysis.risk_rating && (
              <RiskSelector
                value={analysis.risk_rating}
                disabled={!editable || busy}
                onChange={(rating: RiskRating) =>
                  void run(() => api.editAnalysis(analysis.id, { risk_rating: rating }))
                }
              />
            )}
          </div>
        </header>

        <div className="space-y-4 px-5 py-4">
          {analysis.citations_total > 0 && (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-700">
                <span
                  aria-hidden
                  className="mr-1.5 font-bold"
                  style={{
                    color: allVerified ? "var(--status-good)" : "var(--status-warning)",
                  }}
                >
                  {allVerified ? "✓" : "!"}
                </span>
                <span className="font-semibold tabular-nums">
                  {analysis.citations_verified} of {analysis.citations_total}
                </span>{" "}
                claims traced to a line that is verifiably in this circular.
                {!allVerified && " The rest are marked unverified below."}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Verification is done by matching the quote against the stored text — not by
                asking the model whether it was right.
              </p>
            </div>
          )}

          {analysis.needs_review && (
            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-warning)]">
                !
              </span>
              Confidence is below the auto-accept threshold — this draft needs a closer read.
            </p>
          )}

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Summary
            </h3>
            <EditableText
              label="Summary"
              value={analysis.summary ?? ""}
              disabled={!editable}
              onSave={(next) => run(() => api.editAnalysis(analysis.id, { summary: next }))}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Why this rating
              </h3>
              <CitationChip
                citation={analysis.risk_citation}
                active={sameCitation(activeCitation, analysis.risk_citation)}
                onSelect={onSelectCitation}
              />
            </div>
            <EditableText
              label="Risk reasoning"
              rows={3}
              value={analysis.risk_reasoning ?? ""}
              disabled={!editable}
              onSave={(next) =>
                run(() => api.editAnalysis(analysis.id, { risk_reasoning: next }))
              }
            />
          </div>

          <p className="text-xs text-gray-400">
            Drafted by {analysis.model_name}
            {analysis.edited_by_name && ` · edited by ${analysis.edited_by_name}`}
            {analysis.reviewed_by_name
              ? ` · approved by ${analysis.reviewed_by_name}`
              : " · not published until a human approves it"}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Impacted departments{" "}
            <span className="text-gray-400">({analysis.impacted_functions.length})</span>
          </h2>
          {editable && unlisted.length > 0 && (
            <select
              aria-label="Add an impacted department"
              value=""
              disabled={busy}
              onChange={(e) =>
                e.target.value && void run(() => api.addFunction(analysis.id, e.target.value))
              }
              className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
            >
              <option value="">Add a department…</option>
              {unlisted.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} · {f.name}
                </option>
              ))}
            </select>
          )}
        </header>
        <ul className="divide-y divide-gray-100">
          {analysis.impacted_functions.map((f) => (
            <li key={f.code} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  <span className="mr-2 tabular-nums text-gray-400">{f.code}</span>
                  {f.name}
                  {f.source === "HUMAN" && (
                    <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                      added by reviewer
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-3">
                  <ConfidenceMeter value={f.confidence} />
                  <CitationChip
                    citation={f.citation}
                    active={sameCitation(activeCitation, f.citation)}
                    onSelect={onSelectCitation}
                  />
                  {editable && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => api.removeFunction(analysis.id, f.code))}
                      className="text-xs text-gray-400 hover:text-[color:var(--status-critical)]"
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
              {f.reasoning && (
                <p className="mt-1 max-w-3xl text-sm text-gray-600">{f.reasoning}</p>
              )}
            </li>
          ))}
          {analysis.impacted_functions.length === 0 && (
            <li className="px-5 py-4 text-sm text-gray-500">
              No department was identified as impacted.
            </li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Action items <span className="text-gray-400">({analysis.action_items.length})</span>
          </h2>
          {editable && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-gray-900"
            >
              {adding ? "Cancel" : "Add an item"}
            </button>
          )}
        </header>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
            <label className="flex-1">
              <span className="text-xs text-gray-600">What must be done</span>
              <input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Brief the board on the January 2027 deadline"
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900"
              />
            </label>
            <label>
              <span className="text-xs text-gray-600">Owner</span>
              <select
                value={newItem.owner}
                onChange={(e) => setNewItem({ ...newItem, owner: e.target.value })}
                className="mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              >
                <option value="">Unassigned</option>
                {functions.map((f) => (
                  <option key={f.code} value={f.code}>
                    {f.code}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || newItem.description.trim().length < 3}
              onClick={() =>
                void run(async () => {
                  await api.addActionItem(analysis.circular_id, {
                    description: newItem.description.trim(),
                    priority: newItem.priority as PriorityName,
                    owner_function_code: newItem.owner || null,
                    due_date: null,
                  });
                  setNewItem({ description: "", owner: "", priority: "MEDIUM" });
                  setAdding(false);
                })
              }
              className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-100">
                <th className="px-5 py-2 font-medium">What must be done</th>
                <th className="px-5 py-2 font-medium">Source</th>
                <th className="px-5 py-2 font-medium">Owner</th>
                <th className="px-5 py-2 font-medium">Priority</th>
                <th className="px-5 py-2 font-medium">Due</th>
                {editable && <th className="px-5 py-2 font-medium sr-only">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {analysis.action_items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className={`px-5 py-3 ${PRIORITY_STYLE[item.priority]}`}>
                    {item.description}
                    {item.source === "HUMAN" && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">
                        added by reviewer
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <CitationChip
                      citation={item.citation}
                      active={sameCitation(activeCitation, item.citation)}
                      onSelect={onSelectCitation}
                    />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">
                    {editable ? (
                      <select
                        aria-label={`Owner for: ${item.description.slice(0, 40)}`}
                        value={item.owner_function_code ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() =>
                            api.editActionItem(item.id, {
                              owner_function_code: e.target.value || null,
                            }),
                          )
                        }
                        className="rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-gray-900"
                      >
                        <option value="">—</option>
                        {functions.map((f) => (
                          <option key={f.code} value={f.code}>
                            {f.code}
                          </option>
                        ))}
                      </select>
                    ) : item.owner_function_code ? (
                      <>
                        <span className="tabular-nums text-gray-400">
                          {item.owner_function_code}
                        </span>{" "}
                        {item.owner_function_name}
                      </>
                    ) : (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-700">
                    {editable ? (
                      <select
                        aria-label={`Priority for: ${item.description.slice(0, 40)}`}
                        value={item.priority}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() =>
                            api.editActionItem(item.id, {
                              priority: e.target.value as PriorityName,
                            }),
                          )
                        }
                        className="rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-gray-900"
                      >
                        {(["LOW", "MEDIUM", "HIGH"] as PriorityName[]).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      item.priority
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gray-700">
                    {item.due_date ?? "—"}
                  </td>
                  {editable && (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => api.deleteActionItem(item.id))}
                        className="text-xs text-gray-400 hover:text-[color:var(--status-critical)]"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {analysis.action_items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-sm text-gray-500">
                    No action items were extracted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ApproveBar analysis={analysis} busy={busy} canPublish={can(...CAN_PUBLISH)} onRun={run} />
    </div>
  );
}

function ApproveBar({
  analysis,
  busy,
  canPublish,
  onRun,
}: {
  analysis: Analysis;
  busy: boolean;
  canPublish: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  if (analysis.status === "PUBLISHED") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
        <p className="text-sm text-gray-800">
          <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-good)]">✓</span>
          Approved by <span className="font-semibold">{analysis.reviewed_by_name}</span>
          {analysis.published_at &&
            ` on ${new Date(analysis.published_at).toLocaleString()}`}
          .
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Published analyses are frozen. Re-run the AI to produce a new draft.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4">
      <p className="text-sm text-gray-600">
        {canPublish
          ? "Everything above is a draft. Approving records this version against your name."
          : "You can edit this draft, but approving it requires a reviewer or owner."}
      </p>
      <button
        type="button"
        disabled={busy || !canPublish}
        title={canPublish ? undefined : "Sign in as a reviewer or owner to approve"}
        onClick={() => void onRun(() => api.publish(analysis.id))}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        Approve &amp; publish
      </button>
    </div>
  );
}
