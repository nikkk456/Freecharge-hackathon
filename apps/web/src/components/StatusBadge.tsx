import type { CircularStatusName } from "../lib/api";

// Pipeline state, not health — so this deliberately does NOT use the reserved RAG
// status colours. Neutral greys carry progress; only a genuine failure is coloured.
const STYLES: Record<CircularStatusName, string> = {
  UPLOADED: "bg-gray-100 text-gray-600",
  PARSING: "bg-gray-100 text-gray-600",
  PARSED: "bg-gray-900 text-white",
  ANALYZING: "bg-gray-100 text-gray-600",
  ANALYZED: "bg-gray-900 text-white",
  PUBLISHED: "bg-gray-900 text-white",
  FAILED: "bg-white text-[color:var(--status-critical)] ring-1 ring-inset ring-current",
};

export default function StatusBadge({ status }: { status: CircularStatusName }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status === "FAILED" && <span aria-hidden className="mr-1 font-bold">✕</span>}
      {status}
    </span>
  );
}
