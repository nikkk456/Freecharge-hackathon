// A single ratio against a limit — a meter, not a chart. Fill and track are steps of
// the same blue ramp so the bar reads as one scale, and the number is always shown
// beside it, so the bar is a nicety rather than the only way to read the value.
export default function ConfidenceMeter({
  value,
  width = 44,
}: {
  value: number | null;
  width?: number;
}) {
  if (value == null) return <span className="text-xs text-gray-400">—</span>;
  const pct = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        role="img"
        aria-label={`confidence ${pct} percent`}
        className="inline-block h-1.5 overflow-hidden rounded-full"
        style={{ width, backgroundColor: "var(--seq-track)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: "var(--seq-fill)" }}
        />
      </span>
      <span className="text-xs tabular-nums text-gray-500">{pct}%</span>
    </span>
  );
}
