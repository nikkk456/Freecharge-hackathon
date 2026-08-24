import { StatusGlyph, type Tone } from "@/components/StatusGlyph";
import type { RiskRating } from "@/lib/api";
import { cn } from "@/lib/utils";

// Risk rating is a four-level severity scale, which is exactly what the reserved
// status palette encodes (good → warning → serious → critical). As everywhere else,
// colour never carries the meaning alone: each level ships a glyph and its word, and
// the four glyphs are four distinct shapes, not one shape in four colours.
const LEVELS: Record<RiskRating, Tone> = {
  LOW: "good",
  MEDIUM: "warning",
  HIGH: "serious",
  CRITICAL: "critical",
};

export function riskTone(rating: RiskRating): Tone {
  return LEVELS[rating];
}

export default function RiskBadge({
  rating,
  size = "md",
}: {
  rating: RiskRating;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card font-semibold text-foreground",
        size === "sm" ? "py-0.5 pl-1.5 pr-2.5 text-xs" : "py-1 pl-2 pr-3 text-sm",
      )}
    >
      <StatusGlyph tone={LEVELS[rating]} />
      {rating}
    </span>
  );
}
