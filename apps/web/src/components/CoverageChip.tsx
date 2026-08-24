import { StatusGlyph, toneColor, type Tone } from "@/components/StatusGlyph";
import type { CoverageName } from "@/lib/api";

// Coverage is a three-level state, so it uses the reserved status palette — and, as
// everywhere, colour is never the only signal: each level carries a glyph and a word.
// GAP is deliberately the loudest: it is the finding that creates work.
const LEVELS: Record<CoverageName, { tone: Tone; label: string }> = {
  COVERED: { tone: "good", label: "Covered" },
  PARTIAL: { tone: "warning", label: "Partial" },
  GAP: { tone: "critical", label: "Gap" },
};

export function coverageTone(coverage: CoverageName): Tone {
  return LEVELS[coverage].tone;
}

export function coverageColor(coverage: CoverageName): string {
  return toneColor(LEVELS[coverage].tone);
}

export function coverageLabel(coverage: CoverageName): string {
  return LEVELS[coverage].label;
}

export default function CoverageChip({ coverage }: { coverage: CoverageName }) {
  const { tone, label } = LEVELS[coverage];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-foreground">
      <StatusGlyph tone={tone} />
      {label}
    </span>
  );
}

/** Part-to-whole across the three coverage classes: a horizontal stacked bar with a
 *  2px surface gap between segments, every segment direct-labelled below. */
export function CoverageBar({
  covered,
  partial,
  gaps,
}: {
  covered: number;
  partial: number;
  gaps: number;
}) {
  const parts: { coverage: CoverageName; count: number }[] = [
    { coverage: "COVERED", count: covered },
    { coverage: "PARTIAL", count: partial },
    { coverage: "GAP", count: gaps },
  ];
  const total = covered + partial + gaps;
  if (total === 0) return null;

  const shown = parts.filter((p) => p.count > 0);
  return (
    <div>
      <div
        className="flex h-3 gap-[2px]"
        role="img"
        aria-label={parts.map((p) => `${p.count} ${coverageLabel(p.coverage)}`).join(", ")}
      >
        {shown.map((part, index) => (
          <div
            key={part.coverage}
            className="transition-[width] duration-500 ease-out"
            style={{
              width: `${(part.count / total) * 100}%`,
              backgroundColor: coverageColor(part.coverage),
              borderTopLeftRadius: index === 0 ? 4 : 0,
              borderBottomLeftRadius: index === 0 ? 4 : 0,
              borderTopRightRadius: index === shown.length - 1 ? 4 : 0,
              borderBottomRightRadius: index === shown.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
        {parts.map((part) => (
          <div key={part.coverage} className="flex items-center gap-2 text-sm">
            <StatusGlyph tone={LEVELS[part.coverage].tone} square />
            <span className="text-muted-foreground">{coverageLabel(part.coverage)}</span>
            <span className="font-semibold tabular-nums text-foreground">{part.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
