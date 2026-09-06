import { Sparkles, X } from "lucide-react";
import { Chip, Line, Note } from "./parts";

/**
 * Stage 2, animated: the model reads the parsed circular and writes a draft.
 *
 * Two things are being argued here at once, and the second is the important one.
 * The first is that the output is structured — a summary, a rating, the departments
 * it lands on, the obligations it creates. The second is that none of it is
 * trusted: the departments are picked from our own library rather than named
 * freely, an invented code is dropped instead of stored, and the whole card is
 * stamped DRAFT because the model has no way to write anything else.
 *
 * The rejected chip is the beat that earns the scene. Showing only the parts that
 * worked would be a demo; showing the guard doing its job is the product.
 */

const ITEMS = [
  { text: "Restrict recovery calls to the 8:00 a.m. – 7:00 p.m. window", owner: "F06", at: 1750 },
  { text: "Publish the annual list of engaged recovery agencies", owner: "F16", at: 1900 },
  { text: "Route agent complaints through the nodal officer", owner: "F07", at: 2050 },
];

export default function AnalyseScene() {
  return (
    <div className="grid flex-1 grid-cols-[minmax(0,5rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,7rem)_minmax(0,1fr)] sm:gap-5">
      {/* What it is reading — the string Stage 1 produced, nothing else. */}
      <div className="a-fade">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Parsed text
        </p>
        <div className="space-y-[6px] rounded-md border border-border bg-muted/40 p-2.5">
          {[96, 88, 74, 92, 80, 68, 90, 58].map((w, i) => (
            <Line key={w + i} w={w} delay={60 * i} tone="faint" />
          ))}
        </div>
        <div style={{ animationDelay: "500ms" }} className="a-fade mt-2 flex justify-center">
          <Chip icon={Sparkles} tone="brand">
            Model
          </Chip>
        </div>
      </div>

      {/* What it produced. */}
      <div
        style={{ animationDelay: "420ms" }}
        className="a-slide relative rounded-lg border border-brand-line/45 bg-card p-3 shadow-sm sm:p-4"
      >
        {/* Not a badge in the corner — a stamp, landing on paper, because the point
            is that this state is applied to the work rather than chosen by it. */}
        <span
          style={{ animationDelay: "2300ms" }}
          className="a-stamp absolute -right-1 -top-2 rounded border-2 border-brand/45 bg-card px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-brand/70"
        >
          Draft
        </span>

        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Summary
        </p>
        <div className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-foreground">
          <span style={{ animationDelay: "620ms" }} className="a-fade block">
            Tightens conduct rules for recovery agents:
          </span>
          <span style={{ animationDelay: "740ms" }} className="a-fade block">
            contact hours, mandatory identification, and an
          </span>
          <span style={{ animationDelay: "860ms" }} className="a-fade block">
            annual published list of engaged agencies.
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div style={{ animationDelay: "1150ms" }} className="a-pop">
            <span className="rounded-md border border-status-serious/35 bg-status-serious-surface px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-status-serious">
              Risk · High
            </span>
          </div>
          <div className="min-w-[5rem] max-w-[11rem] flex-1">
            <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
              Confidence
            </p>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full" style={{ background: "var(--seq-track)" }}>
              <span
                style={{ animationDelay: "1300ms", background: "var(--seq-fill)", width: "78%" }}
                className="a-fill block h-full rounded-full"
              />
            </span>
          </div>
        </div>

        {/* Departments are chosen from the library by code — so one the model made
            up simply has nothing to resolve to. */}
        <div className="mt-3 border-t border-border pt-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Impacted departments
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="teal" style={{ animationDelay: "1450ms" }} className="a-pop">
              F06 · Collections &amp; Recovery
            </Chip>
            <Chip tone="teal" style={{ animationDelay: "1550ms" }} className="a-pop">
              F07 · Grievance &amp; Nodal
            </Chip>
            <span className="inline-flex items-center gap-1.5">
              <span
                style={{ animationDelay: "1650ms" }}
                className="a-pop inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground/70 line-through decoration-muted-foreground/50"
              >
                <X aria-hidden className="size-2.5 no-underline" strokeWidth={3} />
                F42
              </span>
              <Note style={{ animationDelay: "1700ms" }} className="a-fade">
                not in the library — dropped, never stored
              </Note>
            </span>
          </div>
        </div>

        <div className="mt-2.5 border-t border-border pt-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Obligations extracted
          </p>
          <ul className="mt-1.5 space-y-1">
            {ITEMS.map((item) => (
              <li
                key={item.owner}
                style={{ animationDelay: `${item.at}ms` }}
                className="a-slide flex items-center gap-2"
              >
                <span aria-hidden className="size-1 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-foreground">
                  {item.text}
                </span>
                <Chip tone="muted" className="shrink-0">
                  {item.owner}
                </Chip>
              </li>
            ))}
          </ul>
        </div>

        <Note style={{ animationDelay: "2500ms" }} className="a-fade mt-2.5 border-t border-border pt-2">
          The model proposes. It has no path to <span className="font-semibold text-foreground">published</span> —
          that word is a human&rsquo;s to write.
        </Note>
      </div>
    </div>
  );
}
