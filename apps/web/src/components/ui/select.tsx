import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A styled NATIVE <select>.
 *
 * Deliberately not Radix Select yet: these sit inside table cells that are already
 * dense, and swapping in a portalled listbox is a behaviour change worth doing on
 * its own rather than folded into a styling pass. This gives the native control the
 * same border, ring and typography as every other input, which is what was actually
 * broken — an unstyled native select renders as an OS widget and breaks the page's
 * visual language.
 */
// The native `size` attribute on <select> is a row count (number), so it is omitted
// before adding our own visual-size variant — intersecting the two collapses to never.
type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
  size?: "sm" | "default";
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, size = "default", children, ...props }, ref) => (
  <div className="relative inline-flex w-full items-center">
    <select
      ref={ref}
      className={cn(
        "w-full appearance-none rounded-md border border-input bg-card text-foreground shadow-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-7 py-0 pl-2 pr-7 text-xs" : "h-9 py-1 pl-3 pr-8 text-sm",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden
      className={cn(
        "pointer-events-none absolute text-muted-foreground",
        size === "sm" ? "right-2 size-3" : "right-2.5 size-3.5",
      )}
    />
  </div>
  ),
);
Select.displayName = "Select";

export { Select };
