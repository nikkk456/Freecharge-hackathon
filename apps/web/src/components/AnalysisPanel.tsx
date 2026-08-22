import ConfidenceMeter from "./ConfidenceMeter";
import RiskBadge from "./RiskBadge";
import type { Analysis, PriorityName } from "../lib/api";

const PRIORITY_STYLE: Record<PriorityName, string> = {
  HIGH: "font-semibold text-gray-900",
  MEDIUM: "text-gray-700",
  LOW: "text-gray-500",
};

export default function AnalysisPanel({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900">AI analysis</h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
              v{analysis.version} · {analysis.status}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">confidence</span>
            <ConfidenceMeter value={analysis.confidence} width={56} />
            {analysis.risk_rating && <RiskBadge rating={analysis.risk_rating} />}
          </div>
        </header>

        <div className="space-y-4 px-5 py-4">
          {analysis.needs_review && (
            <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
              <span aria-hidden className="mr-1.5 font-bold text-[color:var(--status-warning)]">
                !
              </span>
              Confidence is below the auto-accept threshold — this draft needs a closer read.
            </p>
          )}

          <p className="text-sm leading-relaxed text-gray-800">{analysis.summary}</p>

          {analysis.risk_reasoning && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Why this rating
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-700">
                {analysis.risk_reasoning}
              </p>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Drafted by {analysis.model_name} · not published until a human approves it
          </p>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <header className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Impacted departments{" "}
            <span className="text-gray-400">({analysis.impacted_functions.length})</span>
          </h2>
        </header>
        <ul className="divide-y divide-gray-100">
          {analysis.impacted_functions.map((f) => (
            <li key={f.code} className="px-5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">
                  <span className="mr-2 tabular-nums text-gray-400">{f.code}</span>
                  {f.name}
                </span>
                <ConfidenceMeter value={f.confidence} />
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
        <header className="border-b border-gray-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Action items <span className="text-gray-400">({analysis.action_items.length})</span>
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-100">
                <th className="px-5 py-2 font-medium">What must be done</th>
                <th className="px-5 py-2 font-medium">Owner</th>
                <th className="px-5 py-2 font-medium">Priority</th>
                <th className="px-5 py-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {analysis.action_items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 align-top last:border-0">
                  <td className={`px-5 py-3 ${PRIORITY_STYLE[item.priority]}`}>
                    {item.description}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-gray-700">
                    {item.owner_function_code ? (
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
                  <td className="px-5 py-3 text-gray-700">{item.priority}</td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-gray-700">
                    {item.due_date ?? "—"}
                  </td>
                </tr>
              ))}
              {analysis.action_items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-4 text-sm text-gray-500">
                    No action items were extracted.
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
