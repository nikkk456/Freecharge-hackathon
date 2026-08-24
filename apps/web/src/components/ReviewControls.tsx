import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RiskRating } from "@/lib/api";

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
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{value}</p>
    );
  }

  return (
    <div>
      <Textarea
        aria-label={label}
        rows={rows}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
        }}
      />
      {dirty && (
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="xs"
            onClick={async () => {
              await onSave(draft.trim());
              setDirty(false);
            }}
          >
            Save
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setDraft(value);
              setDirty(false);
            }}
          >
            Discard
          </Button>
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
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      Override
      <Select
        size="sm"
        aria-label="Override the risk rating"
        value={value}
        onChange={(e) => onChange(e.target.value as RiskRating)}
        className="w-[7.5rem]"
      >
        {RATINGS.map((rating) => (
          <option key={rating} value={rating}>
            {rating}
          </option>
        ))}
      </Select>
    </label>
  );
}
