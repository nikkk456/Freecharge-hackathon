// RAG status chip. Colour is reserved for state and is NEVER the only signal —
// each status carries a distinct glyph and its own word, so the chip still reads
// under colour-vision deficiency, in greyscale print, and in forced-colors mode.
export type RagStatus = "green" | "amber" | "red";

const STATUS = {
  green: { token: "--status-good", glyph: "✓", label: "Green" },
  amber: { token: "--status-warning", glyph: "!", label: "Amber" },
  red: { token: "--status-critical", glyph: "✕", label: "Red" },
} as const satisfies Record<RagStatus, { token: string; glyph: string; label: string }>;

export function statusColor(status: RagStatus): string {
  return `var(${STATUS[status].token})`;
}

export function statusLabel(status: RagStatus): string {
  return STATUS[status].label;
}

export default function StatusChip({ status }: { status: RagStatus }) {
  const { glyph, label } = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-white py-0.5 pl-1.5 pr-2.5 text-xs font-medium text-gray-700">
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold leading-none text-white"
        style={{ backgroundColor: statusColor(status) }}
      >
        {glyph}
      </span>
      {label}
    </span>
  );
}
