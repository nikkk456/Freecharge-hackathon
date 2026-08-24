import { StatusGlyph, type Tone } from "@/components/StatusGlyph";
import { cn } from "@/lib/utils";

/**
 * An inline message with a cause and, usually, a next action beside it.
 *
 * Every error in this app reaches the human as one of these rather than as a bare
 * failure. The tinted surfaces come from the reserved status layer, so a callout
 * cannot drift away from the palette the chips use.
 */
const SURFACE: Record<Tone, string> = {
  good: "border-status-good/30 bg-status-good-surface",
  warning: "border-status-warning/40 bg-status-warning-surface",
  serious: "border-status-serious/40 bg-status-warning-surface",
  critical: "border-status-critical/30 bg-status-critical-surface",
  neutral: "border-border bg-muted",
};

export default function Callout({
  tone = "neutral",
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("rounded-lg border px-4 py-3", SURFACE[tone], className)}
      role={tone === "critical" ? "alert" : undefined}
    >
      <div className="flex items-start gap-2.5">
        <StatusGlyph tone={tone} className="mt-px" />
        <div className="min-w-0 flex-1 text-sm text-foreground">
          {title && <p className="font-medium">{title}</p>}
          {children && (
            <div className={cn("text-sm text-muted-foreground", title && "mt-1")}>{children}</div>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
