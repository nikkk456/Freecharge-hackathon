import { Skeleton } from "@/components/ui/skeleton";

/** A placeholder shaped like the table it replaces, so the page does not reflow
 *  when the real rows land. Beats the word "Loading…", which tells the reader
 *  nothing about what is coming. */
export default function TableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="divide-y divide-border" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-3.5">
          {Array.from({ length: columns }).map((_, col) => (
            <Skeleton
              key={col}
              className="h-3.5"
              style={{ width: col === 0 ? "34%" : `${Math.max(10, 20 - col * 2)}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
