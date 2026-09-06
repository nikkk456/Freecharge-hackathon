import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A themed listbox, replacing the styled native <select> this used to be.
 *
 * The native control could be given our border and typography but not its own popup:
 * the browser draws that as an OS widget, so a nineteen-row department picker landed
 * on screen in the system font, in the system blue, sometimes over the browser chrome
 * — the one part of the app that did not look like the app. Radix portals a real
 * listbox we own, which also buys keyboard type-ahead and a scrollable, height-capped
 * popup the native widget decides about on its own.
 *
 * ── The empty value, and why it needs two behaviours ─────────────────────────
 * Radix refuses "" as an item value, and separately reads value="" on the root as
 * "nothing chosen, show the placeholder". Our pickers come in two shapes that need
 * opposite handling:
 *
 *   with a placeholder    — an action picker ("Add a department…") with no "nothing"
 *                           row, which snaps back to the prompt after each use. ""
 *                           must reach Radix untouched, or the trigger renders BLANK:
 *                           Radix sees a value it cannot match to any item and draws
 *                           neither the placeholder nor a label.
 *   without a placeholder — a field with an explicit "nothing" row ("— Unassigned",
 *                           "None — gap"). That row needs a real value to exist at
 *                           all, so "" is swapped for a sentinel on the way in and
 *                           swapped back on the way out.
 *
 * Callers pass and receive "" either way; the translation lives here rather than in
 * nine call sites each inventing its own constant.
 */
const NONE = "__none__";

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  /** Shown while nothing is chosen. Its presence also declares "this picker has no
   *  explicit empty row" — see the note above. */
  placeholder?: string;
  size?: "sm" | "default";
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
};

function Select({
  value,
  onValueChange,
  placeholder,
  size = "default",
  disabled,
  className,
  children,
  ...props
}: SelectProps) {
  const empty = placeholder ? "" : NONE;
  return (
    <SelectPrimitive.Root
      value={value === "" ? empty : value}
      onValueChange={(next) => onValueChange(next === NONE ? "" : next)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={props["aria-label"]}
        className={cn(
          "group/trigger flex items-center justify-between gap-2 rounded-lg border border-input bg-card text-foreground shadow-sm",
          "transition-colors duration-150",
          "hover:border-brand-line/45 hover:bg-muted/30",
          "data-[state=open]:border-brand-line/60 data-[state=open]:bg-muted/30",
          "data-[placeholder]:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm",
          className,
        )}
      >
        {/* The chosen label can outrun the trigger — clip it here rather than widening
            every table column to the longest department name. */}
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            aria-hidden
            className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 overflow-hidden rounded-xl border border-border/70 bg-card/95 shadow-lg backdrop-blur-sm",
            "min-w-[var(--radix-select-trigger-width)] max-w-[min(22rem,var(--radix-select-content-available-width))]",
            "max-h-[var(--radix-select-content-available-height)]",
            // Grow out of the trigger rather than out of the middle of the screen.
            "origin-[var(--radix-select-content-transform-origin)]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <ScrollButton edge="up" />
          <SelectPrimitive.Viewport className="scroll-slim max-h-[17rem] p-1.5">
            {children}
          </SelectPrimitive.Viewport>
          <ScrollButton edge="down" />
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** A fade, not a bar. A solid strip with a chevron in it reads as one more row you
 *  could pick, which is the one thing it is not. */
function ScrollButton({ edge }: { edge: "up" | "down" }) {
  const Primitive =
    edge === "up" ? SelectPrimitive.ScrollUpButton : SelectPrimitive.ScrollDownButton;
  const Icon = edge === "up" ? ChevronUp : ChevronDown;
  return (
    <Primitive
      className={cn(
        "flex h-6 items-center justify-center text-muted-foreground",
        edge === "up"
          ? "bg-gradient-to-b from-card/95 via-card/75 to-transparent"
          : "bg-gradient-to-t from-card/95 via-card/75 to-transparent",
      )}
    >
      <Icon aria-hidden className="size-3" />
    </Primitive>
  );
}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  Omit<React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>, "value"> & {
    value: string;
    /** An identifier shown ahead of the label, in mono. A separate prop rather than
     *  baked into the label string, so the code reads as a reference and the name
     *  reads as prose — the eye scans the two differently. */
    code?: string;
  }
>(({ className, children, value, code, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    value={value === "" ? NONE : value}
    className={cn(
      "group/item relative flex cursor-pointer select-none items-center rounded-lg py-1.5 pl-2.5 pr-8 text-xs text-foreground",
      "transition-colors duration-100",
      // The tint is the affordance. The global :focus-visible ring has to be cancelled
      // here — Radix moves real DOM focus onto each item as you arrow through, so the
      // page-level ring would draw a hard box around every row in turn.
      "outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
      "data-[highlighted]:bg-brand-surface data-[highlighted]:text-brand",
      "data-[state=checked]:font-medium data-[state=checked]:text-brand",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>
      <span className="flex min-w-0 items-baseline gap-2">
        {code && (
          <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground transition-colors group-data-[highlighted]/item:text-brand/70">
            {code}
          </span>
        )}
        <span className="min-w-0 truncate">{children}</span>
      </span>
    </SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
      <Check aria-hidden className="size-3.5 text-brand" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = "SelectItem";

export { Select, SelectItem };
