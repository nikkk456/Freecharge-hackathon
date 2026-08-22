import { useState } from "react";
import CitationChip from "./CitationChip";
import CoverageChip, { CoverageBar } from "./CoverageChip";
import StatusChip from "./StatusChip";
import {
  api,
  CAN_PUBLISH,
  type Citation,
  type ControlOut,
  type CoverageName,
  type Rcm,
} from "../lib/api";
import { useAuth } from "../lib/auth";

const COVERAGES: CoverageName[] = ["COVERED", "PARTIAL", "GAP"];

export default function RcmPanel({
  circularId,
  rcm,
  controls,
  building,
  canBuild,
  activeCitation,
  onSelectCitation,
  onBuild,
  onChanged,
}: {
  circularId: string;
  rcm: Rcm | null;
  controls: ControlOut[];
  building: boolean;
  canBuild: boolean;
  activeCitation: Citation | null;
  onSelectCitation: (citation: Citation) => void;
  onBuild: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ risk: "", control: "", code: "" });

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

  if (!rcm) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-5 py-8 text-center">
        <h2 className="text-sm font-semibold text-gray-900">No Risk &amp; Control Matrix yet</h2>
        <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
          Match each risk this circular creates against the existing control library, and
          surface the ones nothing covers.
        </p>
        <button
          type="button"
          disabled={building || !canBuild}
          onClick={onBuild}
          title={canBuild ? undefined : "Analyse this circular first"}
          className="mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {building ? "Building…" : "Build the matrix"}
        </button>
        {error && (
          <p className="mt-3 text-sm text-[color:var(--status-critical)]">{error}</p>
        )}
      </div>
    );
  }

  const editable = rcm.editable;
  const allVerified =
    rcm.citations_total > 0 && rcm.citations_verified === rcm.citations_total;

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
            <h2 className="text-sm font-semibold text-gray-900">Risk &amp; Control Matrix</h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              {rcm.status}
            </span>
          </div>
          <button
            type="button"
            disabled={building || busy || !editable}
            onClick={onBuild}
            title={editable ? undefined : "Published matrices are frozen"}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 disabled:opacity-50"
          >
            {building ? "Rebuilding…" : "Rebuild"}
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <CoverageBar covered={rcm.covered} partial={rcm.partial} gaps={rcm.gaps} />

          {rcm.gaps > 0 && (
            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
              <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-critical)]">
                ✕
              </span>
              <span className="font-semibold tabular-nums">{rcm.gaps}</span> of{" "}
              {rcm.rows.length} risks have <strong>no existing control</strong> behind them.
              Those are the ones that create work.
            </p>
          )}

          {rcm.citations_total > 0 && (
            <p className="text-xs text-gray-600">
              <span
                aria-hidden
                className="mr-1.5 font-bold"
                style={{ color: allVerified ? "var(--status-good)" : "var(--status-warning)" }}
              >
                {allVerified ? "✓" : "!"}
              </span>
              <span className="font-semibold tabular-nums">
                {rcm.citations_verified} of {rcm.citations_total}
              </span>{" "}
              risks traced to a line that is verifiably in this circular.
            </p>
          )}

          <p className="text-xs text-gray-400">
            Matched against all {controls.length} controls in the library by{" "}
            {rcm.model_name}
            {rcm.reviewed_by_name && ` · approved by ${rcm.reviewed_by_name}`}
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Risks <span className="text-gray-400">({rcm.rows.length})</span>
          </h2>
          {editable && (
            <button
              type="button"
              onClick={() => setAdding((v) => !v)}
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:border-gray-900"
            >
              {adding ? "Cancel" : "Add a risk"}
            </button>
          )}
        </header>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 border-b border-gray-100 bg-gray-50 px-5 py-3">
            <label className="min-w-[16rem] flex-1">
              <span className="text-xs text-gray-600">Risk</span>
              <input
                value={draft.risk}
                onChange={(e) => setDraft({ ...draft, risk: e.target.value })}
                placeholder="What could go wrong"
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900"
              />
            </label>
            <label className="min-w-[14rem] flex-1">
              <span className="text-xs text-gray-600">Control</span>
              <input
                value={draft.control}
                onChange={(e) => setDraft({ ...draft, control: e.target.value })}
                placeholder="What the company does about it"
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-gray-900"
              />
            </label>
            <label>
              <span className="text-xs text-gray-600">Existing control</span>
              <select
                value={draft.code}
                onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                className="mt-1 block rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-gray-900"
              >
                <option value="">None — this is a gap</option>
                {controls.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || draft.risk.trim().length < 3}
              onClick={() =>
                void run(async () => {
                  await api.addRcmRow(circularId, {
                    risk_text: draft.risk.trim(),
                    control_text: draft.control.trim(),
                    coverage: draft.code ? "PARTIAL" : "GAP",
                    mapped_control_code: draft.code || null,
                  });
                  setDraft({ risk: "", control: "", code: "" });
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
                <th className="px-5 py-2 font-medium">Risk</th>
                <th className="px-5 py-2 font-medium">Source</th>
                <th className="px-5 py-2 font-medium">Coverage</th>
                <th className="px-5 py-2 font-medium">Existing control</th>
                {editable && <th className="px-5 py-2 font-medium sr-only">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rcm.rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-5 py-3">
                    <div className="text-gray-900">{row.risk_text}</div>
                    <div className="mt-0.5 text-xs text-gray-500">{row.control_text}</div>
                    {row.reasoning && (
                      <div className="mt-1 max-w-xl text-xs text-gray-400">{row.reasoning}</div>
                    )}
                    {row.source === "HUMAN" && (
                      <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        added by reviewer
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <CitationChip
                      citation={row.citation}
                      active={
                        !!activeCitation &&
                        activeCitation.target_kind === "rcm_row" &&
                        activeCitation.target_ref === row.id
                      }
                      onSelect={onSelectCitation}
                    />
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <select
                        aria-label={`Coverage for: ${row.risk_text.slice(0, 40)}`}
                        value={row.coverage}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() =>
                            api.editRcmRow(row.id, {
                              coverage: e.target.value as CoverageName,
                            }),
                          )
                        }
                        className="rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-gray-900"
                      >
                        {COVERAGES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <CoverageChip coverage={row.coverage} />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <select
                        aria-label={`Control for: ${row.risk_text.slice(0, 40)}`}
                        value={row.control?.code ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void run(() =>
                            api.editRcmRow(row.id, {
                              mapped_control_code: e.target.value || null,
                            }),
                          )
                        }
                        className="rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-gray-900"
                      >
                        <option value="">None — gap</option>
                        {controls.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    ) : row.control ? (
                      <div>
                        <div className="whitespace-nowrap text-gray-900">
                          <span className="mr-1.5 tabular-nums text-gray-400">
                            {row.control.code}
                          </span>
                          {row.control.name}
                        </div>
                        {row.control.owner_function_code && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {row.control.owner_function_code} {row.control.owner_function_name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400">None</span>
                    )}
                    {row.control?.kci_status && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusChip status={row.control.kci_status} />
                        <span className="text-xs text-gray-500">
                          {row.control.kci_name}
                          {row.control.kci_current_value &&
                            ` · ${row.control.kci_current_value} vs ${row.control.kci_target}`}
                        </span>
                      </div>
                    )}
                  </td>
                  {editable && (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => api.deleteRcmRow(row.id))}
                        className="text-xs text-gray-400 hover:text-[color:var(--status-critical)]"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rcm.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-sm text-gray-500">
                    No risks in this matrix yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {rcm.status === "PUBLISHED" ? (
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-4">
          <p className="text-sm text-gray-800">
            <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-good)]">✓</span>
            Matrix approved by <span className="font-semibold">{rcm.reviewed_by_name}</span>
            {rcm.published_at && ` on ${new Date(rcm.published_at).toLocaleString()}`}.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Published matrices are frozen. Rebuild to produce a new draft.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-5 py-4">
          <p className="text-sm text-gray-600">
            {can(...CAN_PUBLISH)
              ? "Approving records this matrix against your name."
              : "Approving the matrix requires a reviewer or owner."}
          </p>
          <button
            type="button"
            disabled={busy || !can(...CAN_PUBLISH) || rcm.rows.length === 0}
            onClick={() => void run(() => api.publishRcm(rcm.id))}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            Approve &amp; publish matrix
          </button>
        </div>
      )}
    </div>
  );
}
