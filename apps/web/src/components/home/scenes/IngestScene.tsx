import { FileText, ScanLine, Server, Type } from "lucide-react";
import { Chip, Line, Mono, Note, Paper } from "./parts";

/**
 * Stage 1, animated: one PDF, two kinds of page, one string of text.
 *
 * The beat worth showing is the *per-page* decision. A whole-document choice is
 * the obvious design and it is wrong in both directions — it either skips OCR on
 * a scanned annexure or spends minutes re-reading pages that already carry a
 * text layer. So the two lanes run side by side at visibly different speeds: the
 * typed page draws instantly, the scanned page waits for a read head to cross it.
 *
 * The last beat is the one the rest of the product depends on. Both lanes empty
 * into a single ribbon, because every citation stored anywhere in this system is a
 * pair of offsets into that one string.
 */

/** Where the read head is when it reaches each row of the scanned page. */
const OCR_ROWS = [
  { w: 92, at: 880 },
  { w: 78, at: 1120 },
  { w: 86, at: 1360 },
  { w: 64, at: 1600 },
];

export default function IngestScene() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      {/* The document arrives. */}
      <div className="a-rise flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <span className="grid size-7 place-items-center rounded-md bg-brand text-primary-foreground">
          <FileText className="size-3.5" strokeWidth={2.2} />
        </span>
        <span className="text-xs font-semibold text-foreground">circular.pdf</span>
        <Chip tone="muted">RBI</Chip>
      </div>

      {/* One document, split by what each page actually is. */}
      <div className="relative flex w-full max-w-[26rem] justify-center">
        <span
          aria-hidden
          style={{ animationDelay: "300ms" }}
          className="a-draw-y h-4 w-px bg-brand-line"
        />
      </div>
      <p
        style={{ animationDelay: "380ms" }}
        className="a-fade -mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
      >
        Judged page by page
      </p>

      <div className="grid w-full max-w-[30rem] grid-cols-2 gap-3">
        {/* Lane A — the typed body. Nothing to decide, nothing to wait for. */}
        <div style={{ animationDelay: "480ms" }} className="a-rise-sm space-y-1.5">
          <Paper label="p. 1 · typed" className="h-[6.5rem]">
            <div className="space-y-[7px]">
              <Line w={88} delay={620} />
              <Line w={96} delay={680} />
              <Line w={72} delay={740} />
              <Line w={92} delay={800} />
              <Line w={54} delay={860} />
            </div>
          </Paper>
          <div style={{ animationDelay: "980ms" }} className="a-pop flex justify-center">
            <Chip icon={Type} tone="brand">
              Text layer
            </Chip>
          </div>
        </div>

        {/* Lane B — the scanned annexure. A read head crosses it, and each line
            resolves as the head reaches it rather than all at once. */}
        <div style={{ animationDelay: "560ms" }} className="a-rise-sm space-y-1.5">
          <Paper label="p. 7 · scanned" className="h-[6.5rem]">
            <div className="relative space-y-[11px] pt-0.5">
              <span
                aria-hidden
                style={{ animationDelay: "700ms", "--scan": "74px" } as React.CSSProperties}
                className="a-scan absolute inset-x-[-10px] top-0 h-6 bg-gradient-to-b from-transparent via-brand-teal/15 to-transparent"
              >
                <span className="absolute inset-x-0 bottom-0 h-px bg-brand-teal" />
              </span>
              {OCR_ROWS.map((row) => (
                <span key={row.at} className="relative block h-[3px]">
                  {/* what the scan actually is — pixels */}
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-foreground/10"
                    style={{ width: `${row.w}%` }}
                  />
                  {/* what OCR recovered from it */}
                  <span
                    style={{ width: `${row.w}%`, animationDelay: `${row.at}ms` }}
                    className="a-draw-x absolute inset-y-0 left-0 rounded-full bg-brand-teal/50"
                  />
                </span>
              ))}
            </div>
          </Paper>
          <div style={{ animationDelay: "1900ms" }} className="a-pop flex justify-center">
            <Chip icon={ScanLine} tone="teal">
              Read by OCR
            </Chip>
          </div>
        </div>
      </div>

      {/* Both lanes empty into one string. This is the invariant the whole product
          rests on, so it gets the full width and the literal expression. */}
      <div className="w-full max-w-[30rem] space-y-1.5">
        <div
          style={{ animationDelay: "2150ms" }}
          className="a-fade relative h-[26px] overflow-hidden rounded-md border border-brand-line/40 bg-brand-surface/60"
        >
          <span
            style={{ animationDelay: "2200ms" }}
            className="a-fill absolute inset-y-0 left-0 bg-gradient-to-r from-brand/25 via-brand/15 to-brand-teal/20"
          />
          <span className="absolute inset-0 flex items-center px-2.5">
            <Mono className="text-brand">raw_text[char_start : char_end]</Mono>
          </span>
        </div>
        <Note style={{ animationDelay: "2650ms" }} className="a-fade text-center">
          One string, one index. Every citation stored later in the system is a pair of
          offsets into this — so nothing may ever rewrite it.
        </Note>
      </div>

      <Chip
        icon={Server}
        tone="muted"
        style={{ animationDelay: "2850ms" }}
        className="a-fade"
      >
        OCR runs locally · the document never leaves the environment
      </Chip>
    </div>
  );
}
