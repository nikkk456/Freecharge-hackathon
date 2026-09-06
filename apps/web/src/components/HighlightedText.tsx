import { useEffect, useMemo, useRef } from "react";

interface Span {
  from: number;
  to: number;
  /** A cited span is the evidence for a claim; a match is what the reader typed. */
  kind: "citation" | "match";
}

/**
 * Renders one page of extracted text, highlighting the slice a citation points at and
 * every occurrence of the reader's search phrase.
 *
 * Citation offsets are absolute into `raw_text`, so they are shifted into page-local
 * space and clamped. Clamping is not defensive padding: a quote can legitimately
 * straddle a page boundary once line-break normalisation is applied, in which case each
 * page shows its own overlapping part.
 *
 * The two kinds of highlight are drawn by one pass over a set of cut points rather than
 * layered on top of each other, because they overlap freely — searching for a phrase
 * inside the cited line is the most likely thing a reviewer does. A citation wins the
 * background where they collide: it is the claim under review, and the search is a way
 * of getting to it.
 */
export default function HighlightedText({
  text,
  pageStart,
  charStart,
  charEnd,
  query,
  scrollToMatch = false,
  scrollKey,
}: {
  text: string;
  pageStart: number;
  charStart: number | null;
  charEnd: number | null;
  /** The reader's search phrase. Matched case-insensitively, as the count in the
   *  header is — the two must agree or the header lies about what is on screen. */
  query?: string;
  /** Set on the first page that contains a match, so one page scrolls rather than
   *  every matching page fighting over the viewport. */
  scrollToMatch?: boolean;
  /** Changes whenever a new citation is picked, so re-selecting scrolls again. */
  scrollKey?: string;
}) {
  const markRef = useRef<HTMLElement>(null);
  const firstMatchRef = useRef<HTMLElement>(null);

  const hasSpan = charStart != null && charEnd != null;
  const from = hasSpan ? Math.max(0, charStart - pageStart) : 0;
  const to = hasSpan ? Math.min(text.length, charEnd - pageStart) : 0;
  const shows = hasSpan && to > from;

  const needle = query?.trim().toLowerCase() ?? "";

  const spans = useMemo<Span[]>(() => {
    const out: Span[] = [];
    if (shows) out.push({ from, to, kind: "citation" });
    if (needle) {
      const hay = text.toLowerCase();
      for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) {
        out.push({ from: at, to: at + needle.length, kind: "match" });
      }
    }
    return out;
  }, [text, shows, from, to, needle]);

  useEffect(() => {
    if (shows) markRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [shows, scrollKey]);

  useEffect(() => {
    // Only when no citation is showing: a citation is a deliberate click and must not
    // be scrolled away from by a search the reader is still typing.
    if (!shows && scrollToMatch) {
      firstMatchRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [needle, shows, scrollToMatch]);

  if (spans.length === 0) return <>{text}</>;

  // Cut the page at every span edge, then ask which spans cover each piece. Handles
  // overlap, nesting and adjacency without any of them being a special case.
  const cuts = [...new Set([0, text.length, ...spans.flatMap((s) => [s.from, s.to])])]
    .filter((at) => at >= 0 && at <= text.length)
    .sort((a, b) => a - b);

  const pieces: React.ReactNode[] = [];
  let matchesSoFar = 0;

  for (let i = 0; i < cuts.length - 1; i++) {
    const [start, end] = [cuts[i], cuts[i + 1]];
    if (start === end) continue;
    const slice = text.slice(start, end);
    const covering = spans.filter((s) => s.from <= start && s.to >= end);

    if (covering.length === 0) {
      pieces.push(slice);
      continue;
    }

    const cited = covering.some((s) => s.kind === "citation");
    const isMatch = covering.some((s) => s.kind === "match");
    const firstOfMatch = isMatch && spans.some((s) => s.kind === "match" && s.from === start);
    if (firstOfMatch) matchesSoFar += 1;

    pieces.push(
      <mark
        key={start}
        ref={cited ? markRef : firstOfMatch && matchesSoFar === 1 ? firstMatchRef : undefined}
        className={
          cited
            ? "rounded-sm px-0.5 text-foreground ring-1 ring-[var(--seq-fill)]/40"
            : "rounded-sm bg-[var(--search-hit)] px-0.5 text-foreground ring-1 ring-[var(--search-hit-edge)]/50"
        }
        style={cited ? { backgroundColor: "var(--highlight)" } : undefined}
      >
        {slice}
      </mark>,
    );
  }

  return <>{pieces}</>;
}
