import { Check } from "lucide-react";
import { StatusGlyph } from "@/components/StatusGlyph";
import type { ItemStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

// Workflow position, not health — so this uses neutral tones, like StatusBadge, and
// never the reserved RAG palette. Progress is not health.
const STYLES: Record<ItemStatus, string> = {
  OPEN: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  IN_PROGRESS: "bg-foreground/85 text-background",
  BLOCKED: "bg-card text-foreground ring-1 ring-inset ring-foreground/35",
  SUBMITTED: "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border",
  CLOSED: "bg-card text-muted-foreground ring-1 ring-inset ring-border",
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
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {status === "CLOSED" && (
        <Check aria-hidden className="size-3 text-status-good" strokeWidth={3} />
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
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-status-critical/30 bg-status-critical-surface py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-foreground"
      title="Past its due date"
    >
      <StatusGlyph tone="critical" />
      {late == null ? "Overdue" : `${late}d overdue`}
    </span>
  );
}
