import { StatusGlyph } from "@/components/StatusGlyph";
import { cn } from "@/lib/utils";

/**
 * How many of the model's claims were traced to a line that provably exists in the
 * circular.
 *
 * This is the product's central claim, so it is rendered at a size that matches — it
 * used to be the smallest text on the page. The ring is a plain conic gradient
 * rather than a chart: one ratio against a limit is a meter, not a visualisation.
 * The figure is always written out beside it, so the ring never carries the value
 * alone.
 */
export default function VerificationBadge({
  verified,
  total,
  noun = "claims",
  className,
}: {
  verified: number;
  total: number;
  /** What was cited — "claims" for an analysis, "risks" for an RCM. */
  noun?: string;
  className?: string;
}) {
  if (total === 0) return null;

  const all = verified === total;
  const pct = Math.round((verified / total) * 100);
  const tone = all ? "good" : "warning";
  const color = all ? "var(--status-good)" : "var(--status-warning)";

  return (
    <div
      className={cn(
        "flex items-start gap-3.5 rounded-lg border px-4 py-3.5",
        all
          ? "border-status-good/25 bg-status-good-surface"
          : "border-status-warning/30 bg-status-warning-surface",
        className,
      )}
    >
      <div
        className="relative grid size-12 shrink-0 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${color} ${pct}%, hsl(var(--border)) ${pct}% 100%)`,
        }}
        role="img"
        aria-label={`${verified} of ${total} ${noun} verified, ${pct} percent`}
      >
        <span className="grid size-9 place-items-center rounded-full bg-card">
          <StatusGlyph tone={tone} className="size-5" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="text-lg font-semibold tabular-nums">
            {verified} of {total}
          </span>{" "}
          <span className="font-medium">{noun} traced</span> to a line that is verifiably in
          this circular.
          {!all && " The rest are marked unverified below."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Verified by matching each quote against the stored text — not by asking the model
          whether it was right.
        </p>
      </div>
    </div>
  );
}
