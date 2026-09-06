import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The pieces every scene in the walkthrough is built from.
 *
 * Six scenes drawn independently would drift into six visual languages, and the
 * point of the walkthrough is that it is one system. So the vocabulary is fixed
 * here: the document is always paper with serif type on it, the system always
 * speaks in sans, an identifier is always mono, and a connector is always a
 * hairline that draws itself from source to claim.
 *
 * Delays are milliseconds and are passed in by the scene, because a scene's beats
 * only make sense read together — scattering them into each part would hide the
 * one thing worth reviewing, which is the order.
 */

/** A sheet of the circular. Serif, warm white, a hairline edge — deliberately not
 *  a card, so it never gets confused with the app's own surfaces. */
export function Paper({
  label,
  children,
  className,
  style,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "relative overflow-hidden rounded-md border border-brand-line/40 bg-card shadow-sm",
        className,
      )}
    >
      {label && (
        <div className="flex items-center gap-1.5 border-b border-border/70 px-2.5 py-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </span>
        </div>
      )}
      <div className="p-2.5">{children}</div>
    </div>
  );
}

/** One line of body text, as a bar. Real sentences at this size would be unreadable
 *  and would ask the viewer to read rather than watch; a bar says "text" and lets
 *  the motion carry the meaning. */
export function Line({
  w,
  delay = 0,
  tone = "ink",
  className,
}: {
  /** Width as a percentage, so a paragraph ragged-rights like a real one. */
  w: number;
  delay?: number;
  tone?: "ink" | "faint" | "brand";
  className?: string;
}) {
  return (
    <span
      style={{ width: `${w}%`, animationDelay: `${delay}ms` }}
      className={cn(
        "a-draw-x block h-[3px] rounded-full",
        tone === "ink" && "bg-foreground/25",
        tone === "faint" && "bg-foreground/20",
        tone === "brand" && "bg-brand/40",
        className,
      )}
    />
  );
}

/** A labelled pill. `tone` picks the layer: brand for identity and action, teal for
 *  the system's own derived facts, status only ever for health. */
export function Chip({
  icon: Icon,
  children,
  tone = "brand",
  className,
  style,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  tone?: "brand" | "teal" | "muted" | "good" | "warning" | "critical";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none",
        tone === "brand" && "border-brand-line/50 bg-brand-surface text-brand",
        tone === "teal" && "border-brand-teal/30 bg-brand-teal-surface text-brand-teal",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
        tone === "good" && "border-status-good/30 bg-status-good-surface text-status-good",
        tone === "warning" &&
          "border-status-warning/35 bg-status-warning-surface text-status-warning",
        tone === "critical" &&
          "border-status-critical/30 bg-status-critical-surface text-status-critical",
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-2.5" strokeWidth={2.6} />}
      {children}
    </span>
  );
}

/** An identifier — a control code, a hash, a character offset. Anything the system
 *  can look up is mono; anything it wrote in prose is not. */
export function Mono({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={style}
      className={cn("font-mono text-[10px] tabular-nums text-muted-foreground", className)}
    >
      {children}
    </span>
  );
}

/** The one-line explanation under a beat. Small, quiet, and always present — a
 *  scene that needs narration to be understood is a scene, not a diagram. */
export function Note({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <p
      style={style}
      className={cn("text-[10.5px] leading-snug text-muted-foreground", className)}
    >
      {children}
    </p>
  );
}

/** A column of the scene, with its heading in the same small-caps everywhere. */
export function Lane({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={style} className={cn("min-w-0", className)}>
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * A connector that draws itself from one thing to another.
 *
 * SVG rather than a bordered div because the interesting connections in this
 * system are not straight: a claim sits above and left of the line it came from,
 * and a curve says "these two are related" where an L-shaped border says "these
 * two are in a table". `len` only has to be at least the path's true length.
 */
export function Thread({
  d,
  delay = 0,
  len = 240,
  dashed,
  tone = "brand",
  className,
}: {
  d: string;
  delay?: number;
  len?: number;
  /** A connection that was attempted and did not land. Reads as provisional at a
   *  glance, which is the honest picture for an unverified claim. */
  dashed?: boolean;
  tone?: "brand" | "teal" | "muted";
  className?: string;
}) {
  const stroke =
    tone === "brand"
      ? "hsl(var(--brand) / 0.55)"
      : tone === "teal"
        ? "hsl(var(--brand-teal) / 0.6)"
        : "hsl(var(--muted-foreground) / 0.45)";

  // A dashed connector cannot also animate stroke-dashoffset — the dash pattern is
  // the animation's own mechanism. It fades in instead, which suits it: nothing was
  // traced, so nothing should look traced.
  return (
    <path
      d={d}
      fill="none"
      stroke={stroke}
      strokeWidth={1.25}
      strokeLinecap="round"
      style={
        dashed
          ? { animationDelay: `${delay}ms`, strokeDasharray: "3 3" }
          : ({ animationDelay: `${delay}ms`, "--len": len } as React.CSSProperties)
      }
      className={cn(dashed ? "a-fade" : "a-trace", className)}
    />
  );
}

/** The full-bleed SVG layer a scene draws its connectors onto. Sits behind the
 *  content and never takes pointer events, so the boxes it joins stay hoverable. */
export function ThreadLayer({
  children,
  viewBox,
}: {
  children: React.ReactNode;
  viewBox: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox={viewBox}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {children}
    </svg>
  );
}
