import { FileSearch, Quote, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import HighlightedText from "@/components/HighlightedText";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Citation, PageSpan, TextSource } from "@/lib/api";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<TextSource, string> = {
  text_layer: "text layer",
  ocr: "read by OCR",
  empty: "no text found",
};

/** How a quote was located, in the reviewer's language. `exact` needs no note. */
const MATCH_NOTE: Record<string, string> = {
  normalised: "matched after normalising the line breaks the PDF introduced",
  case_insensitive: "matched ignoring capitalisation",
};

export interface DocPage extends PageSpan {
  text: string;
}

/**
 * The source document, as a permanently visible reading surface.
 *
 * The whole product rests on one move — click a claim, see the line it came from —
 * and that move only lands if the claim and its evidence are on screen together.
 * Previously the text was a collapsed section far below the analysis, so following
 * a citation scrolled the claim out of view: the reviewer could see the evidence or
 * the assertion, never both. This pane scrolls independently beside them.
 */
export default function DocumentPane({
  pages,
  pageCount,
  ocrPages,
  activeCitation,
  onClearCitation,
  className,
}: {
  pages: DocPage[];
  pageCount: number | null;
  ocrPages: number;
  activeCitation: Citation | null;
  onClearCitation: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const fullText = useMemo(() => pages.map((p) => p.text).join(""), [pages]);

  // Which pages contain the search phrase, and how many times in total.
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !fullText) return null;
    const found: number[] = [];
    const hay = fullText.toLowerCase();
    let at = hay.indexOf(q);
    let total = 0;
    while (at !== -1 && total < 200) {
      const span = pages.find(
        (p) => at >= p.char_start - pages[0].char_start && at < p.char_end - pages[0].char_start,
      );
      if (span && !found.includes(span.page)) found.push(span.page);
      total += 1;
      at = hay.indexOf(q, at + q.length);
    }
    return { pages: found, total };
  }, [query, fullText, pages]);

  const activePage = activeCitation?.page ?? null;

  function jumpToPage(page: number) {
    scrollRef.current
      ?.querySelector(`[data-page="${page}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // A new citation should visibly land, not just quietly change colour somewhere.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!activeCitation) return;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(id);
  }, [activeCitation]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
      aria-label="Source document"
    >
      <header className="shrink-0 border-b border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <FileSearch aria-hidden className="size-4 text-brand" />
            Source document
            {pageCount != null && (
              <span className="font-normal tabular-nums text-muted-foreground">
                {pageCount} page{pageCount === 1 ? "" : "s"}
              </span>
            )}
          </h2>

          <div className="relative w-52">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a phrase…"
              aria-label="Find a phrase in the extracted text"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Page jump strip — the fastest way around an 11-page filing. */}
        {pages.length > 1 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {pages.map((p) => {
              const isActive = activePage === p.page;
              const isHit = hits?.pages.includes(p.page);
              return (
                <button
                  key={p.page}
                  type="button"
                  onClick={() => jumpToPage(p.page)}
                  aria-label={`Jump to page ${p.page}`}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "size-6 rounded-md text-2xs font-semibold tabular-nums transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                    isActive
                      ? "bg-brand text-primary-foreground"
                      : isHit
                        ? "bg-brand-surface-strong text-brand ring-1 ring-inset ring-brand-line/40"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {p.page}
                </button>
              );
            })}
          </div>
        )}

        {hits && (
          <p className="mt-2 text-xs text-muted-foreground">
            {hits.total === 0 ? (
              "No match in this circular."
            ) : (
              <>
                <span className="font-semibold tabular-nums text-foreground">{hits.total}</span>{" "}
                match{hits.total > 1 ? "es" : ""} on page{hits.pages.length > 1 ? "s" : ""}{" "}
                <span className="font-medium tabular-nums text-foreground">
                  {hits.pages.join(", ")}
                </span>
              </>
            )}
          </p>
        )}
      </header>

      {/* What the reviewer is currently looking at, and why. */}
      {activeCitation && (
        <div
          className={cn(
            "shrink-0 animate-fade-up border-b border-brand-line/30 bg-brand-surface px-4 py-2.5",
            flash && "animate-flash-cite",
          )}
        >
          <div className="flex items-start gap-2.5">
            <Quote aria-hidden className="mt-0.5 size-3.5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-semibold uppercase tracking-wider text-brand">
                Showing the source for this claim
                {activeCitation.page ? ` · page ${activeCitation.page}` : ""}
              </p>
              <p className="mt-1 line-clamp-3 text-xs italic leading-relaxed text-foreground">
                “{activeCitation.source_text || activeCitation.quote}”
              </p>
              {MATCH_NOTE[activeCitation.match] && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {MATCH_NOTE[activeCitation.match]} — the wording shown is the document's,
                  not the model's.
                </p>
              )}
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onClearCitation}
              aria-label="Clear the highlight"
              title="Clear the highlight"
              className="-mr-1 shrink-0 text-brand hover:bg-brand-surface-strong"
            >
              <X />
            </Button>
          </div>
        </div>
      )}

      {ocrPages > 0 && (
        <p className="shrink-0 border-b border-status-warning/25 bg-status-warning-surface px-4 py-2 text-xs text-foreground">
          <span className="font-medium">{ocrPages}</span> page{ocrPages === 1 ? "" : "s"} had no
          text layer and {ocrPages === 1 ? "was" : "were"} read by OCR — machine-read text can
          contain mistakes.
        </p>
      )}

      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {pages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No text stored for this circular.
          </p>
        ) : (
          pages.map((page) => (
            <article key={page.page} data-page={page.page} className="scroll-mt-2">
              <header className="sticky top-0 z-10 flex items-baseline justify-between border-y border-border bg-muted/85 px-4 py-1.5 backdrop-blur first:border-t-0">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Page {page.page}
                  <span
                    className={cn(
                      "ml-2 font-medium normal-case tracking-normal",
                      page.source === "text_layer"
                        ? "text-muted-foreground/70"
                        : "text-status-warning",
                    )}
                  >
                    {SOURCE_LABEL[page.source]}
                  </span>
                </span>
                {/* Visible proof the offsets are real: this page is
                    raw_text[char_start:char_end], nothing more. */}
                <span className="font-mono text-2xs tabular-nums text-muted-foreground/70">
                  {page.char_start.toLocaleString()}–{page.char_end.toLocaleString()}
                </span>
              </header>
              <pre className="whitespace-pre-wrap px-4 py-3.5 font-sans text-[0.8125rem] leading-[1.6] text-foreground/90">
                <HighlightedText
                  text={page.text}
                  pageStart={page.char_start}
                  charStart={activeCitation?.char_start ?? null}
                  charEnd={activeCitation?.char_end ?? null}
                  scrollKey={`${activeCitation?.target_kind}:${activeCitation?.target_ref}`}
                />
              </pre>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
