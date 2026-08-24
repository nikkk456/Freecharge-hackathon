import { X } from "lucide-react";
import type { CircularStatusName } from "@/lib/api";
import { cn } from "@/lib/utils";

// Pipeline state, not health — so this deliberately does NOT use the reserved RAG
// status colours. Neutral tones carry progress; only a genuine failure is coloured.
const STYLES: Record<CircularStatusName, string> = {
  UPLOADED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  PARSING: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  PARSED: "bg-foreground/85 text-background",
  ANALYZING: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  ANALYZED: "bg-foreground/85 text-background",
  PUBLISHED: "bg-foreground text-background",
  FAILED: "bg-status-critical-surface text-status-critical ring-1 ring-inset ring-status-critical/40",
};

// Work still in flight gets a quiet pulse, so a polling page reads as busy rather
// than as stalled.
const BUSY: CircularStatusName[] = ["UPLOADED", "PARSING", "ANALYZING"];

export default function StatusBadge({ status }: { status: CircularStatusName }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide",
        STYLES[status],
      )}
    >
      {status === "FAILED" && <X aria-hidden className="size-3" strokeWidth={3} />}
      {BUSY.includes(status) && (
        <span
          aria-hidden
          className="size-1.5 animate-pulse rounded-full bg-current opacity-70"
        />
      )}
      {status}
    </span>
  );
}
