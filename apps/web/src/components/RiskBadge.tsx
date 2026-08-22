import type { RiskRating } from "../lib/api";

// Risk rating is a four-level severity scale, which is exactly what the reserved
// status palette encodes (good → warning → serious → critical). As everywhere else,
// colour never carries the meaning alone: each level ships a glyph and its word.
const LEVELS: Record<RiskRating, { token: string; glyph: string }> = {
  LOW: { token: "--status-good", glyph: "✓" },
  MEDIUM: { token: "--status-warning", glyph: "!" },
  HIGH: { token: "--status-serious", glyph: "▲" },
  CRITICAL: { token: "--status-critical", glyph: "✕" },
};

export default function RiskBadge({
  rating,
  size = "md",
}: {
  rating: RiskRating;
  size?: "sm" | "md";
}) {
  const { token, glyph } = LEVELS[rating];
  const pad = size === "sm" ? "py-0.5 pl-1.5 pr-2.5 text-xs" : "py-1 pl-2 pr-3 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white font-semibold text-gray-800 ${pad}`}
    >
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] leading-none text-white"
        style={{ backgroundColor: `var(${token})` }}
      >
        {glyph}
      </span>
      {rating}
    </span>
  );
}
