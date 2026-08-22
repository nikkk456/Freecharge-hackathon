import { useEffect, useState } from "react";
import type { RiskRating } from "../lib/api";

const RATINGS: RiskRating[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** A text field that only reports a change when the reviewer is done with it.
 *  Saving on every keystroke would write an audit row per character. */
export function EditableText({
  value,
  onSave,
  rows = 4,
  label,
  disabled,
}: {
  value: string;
  onSave: (next: string) => void | Promise<void>;
  rows?: number;
  label: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);

  // Adopt changes from the server (a re-run, another reviewer) unless the local
  // copy has unsaved edits, which must never be silently discarded.
  useEffect(() => {
    if (!dirty) setDraft(value);
  }, [value, dirty]);

  if (disabled) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{value}</p>;
  }

  return (
    <div>
      <textarea
        aria-label={label}
        rows={rows}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
        className="w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-gray-900"
      />
      {dirty && (
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              await onSave(draft.trim());
              setDirty(false);
            }}
            className="rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setDirty(false);
            }}
            className="text-xs text-gray-500 underline hover:text-gray-900"
          >
            Discard
          </button>
        </div>
      )}
    </div>
  );
}

export function RiskSelector({
  value,
  onChange,
  disabled,
}: {
  value: RiskRating;
  onChange: (next: RiskRating) => void;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      Override
      <select
        aria-label="Override the risk rating"
        value={value}
        onChange={(e) => onChange(e.target.value as RiskRating)}
        className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-gray-900"
      >
        {RATINGS.map((rating) => (
          <option key={rating} value={rating}>
            {rating}
          </option>
        ))}
      </select>
    </label>
  );
}
