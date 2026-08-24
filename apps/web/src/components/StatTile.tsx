import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// A single headline count. Deliberately not a one-bar chart: for a current value
// with no history, the number itself is the clearest form. Proportional figures
// (no tabular-nums) — tabular is for columns that must align vertically.
export default function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon?: LucideIcon;
  /** Set only when the number itself is a health signal (e.g. overdue > 0). */
  tone?: "critical" | "good";
}) {
  const alarming = tone === "critical" && value > 0;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-4 py-3 shadow-sm transition-colors",
        alarming ? "border-status-critical/30 bg-status-critical-surface" : "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {Icon && (
          <Icon
            aria-hidden
            className={cn("size-3.5", alarming ? "text-status-critical" : "text-muted-foreground/60")}
          />
        )}
      </div>
      <div
        className={cn(
          "mt-1.5 text-3xl font-semibold leading-none",
          alarming ? "text-status-critical" : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted-foreground/80">{hint}</div>}
    </div>
  );
}
