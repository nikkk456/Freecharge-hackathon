import { useEffect, useRef } from "react";

/**
 * Renders one page of extracted text, highlighting the slice a citation points at.
 *
 * Offsets are absolute into `raw_text`, so they are shifted into page-local space and
 * clamped. Clamping is not defensive padding: a quote can legitimately straddle a page
 * boundary once line-break normalisation is applied, in which case each page shows its
 * own overlapping part.
 */
export default function HighlightedText({
  text,
  pageStart,
  charStart,
  charEnd,
  scrollKey,
}: {
  text: string;
  pageStart: number;
  charStart: number | null;
  charEnd: number | null;
  /** Changes whenever a new citation is picked, so re-selecting scrolls again. */
  scrollKey?: string;
}) {
  const markRef = useRef<HTMLElement>(null);

  const hasSpan = charStart != null && charEnd != null;
  const from = hasSpan ? Math.max(0, charStart - pageStart) : 0;
  const to = hasSpan ? Math.min(text.length, charEnd - pageStart) : 0;
  const shows = hasSpan && to > from;

  useEffect(() => {
    if (shows) markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [shows, scrollKey]);

  if (!shows) return <>{text}</>;

  return (
    <>
      {text.slice(0, from)}
      <mark
        ref={markRef}
        className="rounded-sm px-0.5 text-foreground ring-1 ring-[var(--seq-fill)]/40"
        style={{ backgroundColor: "var(--highlight)" }}
      >
        {text.slice(from, to)}
      </mark>
      {text.slice(to)}
    </>
  );
}
