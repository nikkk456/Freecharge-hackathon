import type { CoverageName } from "../lib/api";

// Coverage is a three-level state, so it uses the reserved status palette — and, as
// everywhere, colour is never the only signal: each level carries a glyph and a word.
// GAP is deliberately the loudest: it is the finding that creates work.
const LEVELS: Record<CoverageName, { token: string; glyph: string; label: string }> = {
  COVERED: { token: "--status-good", glyph: "✓", label: "Covered" },
  PARTIAL: { token: "--status-warning", glyph: "!", label: "Partial" },
  GAP: { token: "--status-critical", glyph: "✕", label: "Gap" },
};

export function coverageColor(coverage: CoverageName): string {
  return `var(${LEVELS[coverage].token})`;
}

export function coverageLabel(coverage: CoverageName): string {
  return LEVELS[coverage].label;
}

export default function CoverageChip({ coverage }: { coverage: CoverageName }) {
  const { glyph, label } = LEVELS[coverage];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-gray-700">
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
        style={{ backgroundColor: coverageColor(coverage) }}
      >
        {glyph}
      </span>
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
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] font-bold leading-none text-white"
              style={{ backgroundColor: coverageColor(part.coverage) }}
            >
              {LEVELS[part.coverage].glyph}
            </span>
            <span className="text-gray-600">{coverageLabel(part.coverage)}</span>
            <span className="font-semibold tabular-nums text-gray-900">{part.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
