import type { LucideIcon } from "lucide-react";

/** A designed empty state. The old UI rendered these as a grey sentence inside a
 *  table cell, which is what a judge sees on a freshly seeded database. */
export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
        <Icon aria-hidden className="size-[18px] text-muted-foreground" />
      </span>
      <p className="mt-3.5 text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
