import { StatusGlyph, toneColor, type Tone } from "@/components/StatusGlyph";

// RAG status chip. Colour is reserved for state and is NEVER the only signal —
// each status carries a distinct glyph and its own word, so the chip still reads
// under colour-vision deficiency, in greyscale print, and in forced-colors mode.
export type RagStatus = "green" | "amber" | "red";

const STATUS = {
  green: { tone: "good", label: "Green" },
  amber: { tone: "warning", label: "Amber" },
  red: { tone: "critical", label: "Red" },
} as const satisfies Record<RagStatus, { tone: Tone; label: string }>;

export function statusTone(status: RagStatus): Tone {
  return STATUS[status].tone;
}

export function statusColor(status: RagStatus): string {
  return toneColor(STATUS[status].tone);
}

export function statusLabel(status: RagStatus): string {
  return STATUS[status].label;
}

export default function StatusChip({ status }: { status: RagStatus }) {
  const { tone, label } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-foreground">
      <StatusGlyph tone={tone} />
      {label}
    </span>
  );
}
