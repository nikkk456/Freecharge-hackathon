// A single headline count. Deliberately not a one-bar chart: for a current value
// with no history, the number itself is the clearest form. Proportional figures
// (no tabular-nums) — tabular is for columns that must align vertically.
export default function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-3xl font-semibold leading-none text-gray-900">
        {value.toLocaleString()}
      </div>
      {hint && <div className="mt-1.5 text-xs text-gray-400">{hint}</div>}
    </div>
  );
}
