import type { ItemStatus } from "../lib/api";

// Workflow position, not health — so this uses neutral greys, like StatusBadge, and
// never the reserved RAG palette. Progress is not health.
const STYLES: Record<ItemStatus, string> = {
  OPEN: "bg-gray-100 text-gray-700",
  IN_PROGRESS: "bg-gray-800 text-white",
  BLOCKED: "bg-white text-gray-700 ring-1 ring-inset ring-gray-400",
  SUBMITTED: "bg-gray-200 text-gray-800",
  CLOSED: "bg-white text-gray-500 ring-1 ring-inset ring-gray-200",
};

const LABELS: Record<ItemStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  SUBMITTED: "Submitted",
  CLOSED: "Closed",
};

export function itemStatusLabel(status: ItemStatus): string {
  return LABELS[status];
}

export default function ItemStatusChip({ status }: { status: ItemStatus }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {status === "CLOSED" && (
        <span aria-hidden className="mr-1 text-[color:var(--status-good)]">
          ✓
        </span>
      )}
      {LABELS[status]}
    </span>
  );
}

/** Lateness is a state of health, so it does use the status palette — with a glyph
 *  and a word, never colour alone. */
export function OverdueChip({ days }: { days: number | null }) {
  const late = days == null ? null : Math.abs(days);
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gray-200 bg-white py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-gray-700"
      title="Past its due date"
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
        style={{ backgroundColor: "var(--status-critical)" }}
      >
        !
      </span>
      {late == null ? "Overdue" : `${late}d overdue`}
    </span>
  );
}
