import { Check, X } from "lucide-react";
import type { Citation, CitationMatch } from "@/lib/api";
import { cn } from "@/lib/utils";

// Why a claim could not be grounded, in the reviewer's language rather than ours.
const UNVERIFIED_REASON: Record<CitationMatch, string> = {
  not_found: "The quoted sentence is not in this circular — treat this claim with suspicion.",
  empty: "The model gave no supporting quote for this claim.",
  too_short: "The quote is too short to prove which part of the circular it refers to.",
  exact: "",
  normalised: "",
  case_insensitive: "",
};

// How a verified quote was matched. Exact needs no explanation; the looser matches do,
// because a reviewer is entitled to know we did not find it byte-for-byte.
const VERIFIED_NOTE: Partial<Record<CitationMatch, string>> = {
  normalised: "Matched after normalising the line breaks the PDF introduced.",
  case_insensitive: "Matched ignoring capitalisation.",
};

export default function CitationChip({
  citation,
  active,
  onSelect,
}: {
  citation: Citation | null;
  active: boolean;
  onSelect: (citation: Citation) => void;
}) {
  if (!citation) return null;

  if (!citation.verified) {
    return (
      <span
        title={UNVERIFIED_REASON[citation.match]}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-status-critical/30 bg-status-critical-surface px-1.5 py-0.5 text-xs font-medium text-status-critical"
      >
        <X aria-hidden className="size-3" strokeWidth={3} />
        unverified
      </span>
    );
  }

  const note = VERIFIED_NOTE[citation.match];
  return (
    <button
      type="button"
      onClick={() => onSelect(citation)}
      title={note ? `${note} Click to show it in the circular.` : "Show this line in the circular"}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-status-good/30 bg-status-good-surface text-foreground hover:border-status-good/60",
      )}
    >
      <Check
        aria-hidden
        className={cn("size-3", !active && "text-status-good")}
        strokeWidth={3}
      />
      {citation.page ? `page ${citation.page}` : "source"}
      {note && <span aria-hidden>*</span>}
    </button>
  );
}
