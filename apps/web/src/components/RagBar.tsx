import { StatusGlyph } from "@/components/StatusGlyph";
import { statusColor, statusLabel, statusTone, type RagStatus } from "@/components/StatusChip";

// Part-to-whole across three reserved status classes -> a horizontal stacked bar.
// Segments are separated by a 2px surface gap (so adjacent fills never blur into
// one another) and every segment is direct-labelled below with glyph + word +
// count, which is also the relief for amber sitting under 3:1 on a light surface.
const ORDER: RagStatus[] = ["green", "amber", "red"];

export default function RagBar({ mix }: { mix: Partial<Record<RagStatus, number>> }) {
  const counts = ORDER.map((s) => ({ status: s, count: mix[s] ?? 0 }));
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No indicators loaded.</p>;

  const shown = counts.filter((c) => c.count > 0);
  return (
    <div>
      <div
        className="flex h-3 gap-[2px]"
        role="img"
        aria-label={counts.map((c) => `${c.count} ${statusLabel(c.status)}`).join(", ")}
      >
        {shown.map((c, i) => (
          <div
            key={c.status}
            className="transition-[width] duration-500 ease-out"
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
            <StatusGlyph tone={statusTone(c.status)} square />
            <span className="text-muted-foreground">{statusLabel(c.status)}</span>
            <span className="font-semibold tabular-nums text-foreground">{c.count}</span>
            <span className="text-xs tabular-nums text-muted-foreground/70">
              {Math.round((c.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
