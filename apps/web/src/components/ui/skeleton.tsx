import { cn } from "@/lib/utils";

/** A loading placeholder shaped like the thing it is standing in for. A sweeping
 *  sheen rather than a pulse, so a long wait reads as progress, not a stalled page. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-md bg-muted", className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.07] to-transparent" />
    </div>
  );
}
