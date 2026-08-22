import type { Citation, CitationMatch } from "../lib/api";

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
        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-gray-200 px-1.5 py-0.5 text-xs text-[color:var(--status-critical)]"
      >
        <span aria-hidden className="font-bold">
          ✕
        </span>
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
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs transition-colors ${
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900"
      }`}
    >
      <span aria-hidden className={active ? "" : "text-[color:var(--status-good)]"}>
        ✓
      </span>
      {citation.page ? `page ${citation.page}` : "source"}
      {note && <span aria-hidden>*</span>}
    </button>
  );
}
