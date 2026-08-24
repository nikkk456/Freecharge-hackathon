import { AlertTriangle, Check, ChevronsUp, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The single place the reserved status palette becomes a visible mark.
 *
 * The rule this component exists to enforce: COLOUR IS NEVER THE ONLY SIGNAL. Each
 * tone carries a distinct *shape* as well as a distinct hue, so the mark still reads
 * under colour-vision deficiency, in greyscale print, and in forced-colors mode.
 * That is why these are four visually distinct icons rather than one icon in four
 * colours — and why swapping the old emoji for Lucide had to keep the glyph, not
 * drop it. Callers always pair this with a word.
 */
export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

const ICON: Record<Tone, LucideIcon> = {
  good: Check,
  warning: AlertTriangle,
  serious: ChevronsUp,
  critical: X,
  neutral: Check,
};

const COLOR: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "hsl(var(--muted-foreground))",
};

export function toneColor(tone: Tone): string {
  return COLOR[tone];
}

/** A filled disc with the tone's glyph knocked out of it. */
export function StatusGlyph({
  tone,
  className,
  square,
}: {
  tone: Tone;
  className?: string;
  /** Rounded square instead of a circle — used in legends, where the mark stands
   *  in for a bar segment rather than for a chip. */
  square?: boolean;
}) {
  const Icon = ICON[tone];
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center text-white",
        square ? "rounded-[3px]" : "rounded-full",
        className,
      )}
      style={{ backgroundColor: COLOR[tone] }}
    >
      <Icon className="size-2.5" strokeWidth={3.5} />
    </span>
  );
}

/** The bare glyph in the tone's colour, with no disc behind it — for inline use in
 *  a sentence, where a filled disc would sit too heavily in the text. */
export function ToneIcon({ tone, className }: { tone: Tone; className?: string }) {
  const Icon = ICON[tone];
  return (
    <Icon
      aria-hidden
      className={cn("size-3.5 shrink-0", className)}
      strokeWidth={3}
      style={{ color: COLOR[tone] }}
    />
  );
}
