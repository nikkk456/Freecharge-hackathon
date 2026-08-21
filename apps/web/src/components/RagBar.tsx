import { statusColor, statusLabel, type RagStatus } from "./StatusChip";

// Part-to-whole across three reserved status classes -> a horizontal stacked bar.
// Segments are separated by a 2px surface gap (so adjacent fills never blur into
// one another) and every segment is direct-labelled below with glyph + word +
// count, which is also the relief for amber sitting under 3:1 on a light surface.
const ORDER: RagStatus[] = ["green", "amber", "red"];

const GLYPH: Record<RagStatus, string> = { green: "✓", amber: "!", red: "✕" };

export default function RagBar({ mix }: { mix: Partial<Record<RagStatus, number>> }) {
  const counts = ORDER.map((s) => ({ status: s, count: mix[s] ?? 0 }));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return <p className="text-sm text-gray-500">No indicators loaded.</p>;

  return (
    <div>
      <div className="flex h-3 gap-[2px]" role="img" aria-label={
        counts.map((c) => `${c.count} ${statusLabel(c.status)}`).join(", ")
      }>
        {counts
          .filter((c) => c.count > 0)
          .map((c, i, shown) => (
            <div
              key={c.status}
              style={{
                width: `${(c.count / total) * 100}%`,
                backgroundColor: statusColor(c.status),
                borderTopLeftRadius: i === 0 ? 4 : 0,
                borderBottomLeftRadius: i === 0 ? 4 : 0,
                borderTopRightRadius: i === shown.length - 1 ? 4 : 0,
                borderBottomRightRadius: i === shown.length - 1 ? 4 : 0,
              }}
            />
          ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {counts.map((c) => (
          <div key={c.status} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden
              className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[10px] font-bold leading-none text-white"
              style={{ backgroundColor: statusColor(c.status) }}
            >
              {GLYPH[c.status]}
            </span>
            <span className="text-gray-600">{statusLabel(c.status)}</span>
            <span className="font-semibold tabular-nums text-gray-900">{c.count}</span>
            <span className="text-xs text-gray-400 tabular-nums">
              {Math.round((c.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
