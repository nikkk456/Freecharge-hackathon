import { Gauge, Lock, MoveRight } from "lucide-react";
import { StatusGlyph } from "@/components/StatusGlyph";
import { cn } from "@/lib/utils";
import { Chip, Mono, Note } from "./parts";

/**
 * Stage 5, animated: for each risk this circular creates, does a control we already
 * own actually answer it?
 *
 * The scene is built around the one rule that matters — a row may never claim more
 * coverage than it can point at. Reporting a risk as covered with nothing behind it
 * *hides work*, which is the most damaging thing this feature could do; far worse
 * than flagging a gap a reviewer then corrects. So the third row is the payload:
 * the match reaches for a control, finds none, and the row is forced to GAP by code
 * rather than by the model's opinion of itself.
 *
 * The amber indicator on the first row is the other half of the argument. Control →
 * KCI is a fact in our own data, so it is derived, never asked for. That is what
 * makes "covered by C-006, currently amber" a sentence worth trusting.
 */

type Row = {
  risk: string;
  control: { code: string; name: string } | null;
  coverage: "COVERED" | "PARTIAL" | "GAP";
  kci?: string;
  at: number;
};

const ROWS: Row[] = [
  {
    risk: "Calls placed outside the permitted window",
    control: { code: "C-006", name: "Recovery agent code-of-conduct & call timing" },
    coverage: "COVERED",
    kci: "K-006 · amber",
    at: 250,
  },
  {
    risk: "Agency engagement without an exit clause",
    control: { code: "C-031", name: "Outsourcing agreement & exit governance" },
    coverage: "PARTIAL",
    at: 650,
  },
  {
    risk: "Advance notice before a borrower field visit",
    control: null,
    coverage: "GAP",
    at: 1050,
  },
];

const TONE = { COVERED: "good", PARTIAL: "warning", GAP: "critical" } as const;
const LABEL = { COVERED: "Covered", PARTIAL: "Partial", GAP: "Gap" } as const;

export default function RcmScene() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Risks this circular creates
        </p>
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Your control library
        </p>
      </div>

      <div className="space-y-2">
        {ROWS.map((row) => (
          <div
            key={row.risk}
            style={{ animationDelay: `${row.at}ms` }}
            className="a-rise-sm rounded-lg border border-border bg-card p-2.5 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
                {row.risk}
              </span>

              {/* The reach — the beat this scene is built on, so it is drawn heavily
                  enough to actually read. It traces itself when a control was found,
                  and merely fades in, dashed, when the reach came back with nothing. */}
              {row.control ? (
                <span
                  aria-hidden
                  style={{ animationDelay: `${row.at + 300}ms` }}
                  className="a-draw-x hidden h-[1.5px] w-8 shrink-0 rounded-full bg-brand/45 sm:block"
                />
              ) : (
                <span
                  aria-hidden
                  style={{ animationDelay: `${row.at + 300}ms` }}
                  className="a-fade hidden w-8 shrink-0 border-t-[1.5px] border-dashed border-muted-foreground/45 sm:block"
                />
              )}
              <MoveRight
                aria-hidden
                strokeWidth={2.4}
                style={{ animationDelay: `${row.at + 320}ms` }}
                className={cn(
                  "a-fade hidden size-3.5 shrink-0 sm:block",
                  row.control ? "text-brand/70" : "text-muted-foreground/50",
                )}
              />

              {row.control ? (
                <span
                  style={{ animationDelay: `${row.at + 520}ms` }}
                  className="a-pop flex min-w-0 max-w-[9rem] shrink-0 items-center gap-1.5 rounded-md border border-brand-teal/30 bg-brand-teal-surface px-2 py-1 sm:max-w-[13rem]"
                >
                  <Mono className="shrink-0 font-semibold text-brand-teal">
                    {row.control.code}
                  </Mono>
                  <span className="hidden truncate text-[10px] text-muted-foreground sm:block">
                    {row.control.name}
                  </span>
                </span>
              ) : (
                <span
                  style={{ animationDelay: `${row.at + 520}ms` }}
                  className="a-fade shrink-0 rounded-md border border-dashed border-border px-2 py-1 text-[10px] italic text-muted-foreground/70"
                >
                  nothing in the library answers this
                </span>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-border/70 pt-1.5">
              <span
                style={{ animationDelay: `${row.at + 720}ms` }}
                className="a-pop inline-flex items-center gap-1.5 text-[10px] font-semibold text-foreground"
              >
                <StatusGlyph tone={TONE[row.coverage]} className="size-3.5" />
                {LABEL[row.coverage]}
              </span>

              {row.kci && (
                <>
                  <Chip
                    icon={Gauge}
                    tone="muted"
                    style={{ animationDelay: `${row.at + 900}ms` }}
                    className="a-pop"
                  >
                    {row.kci}
                  </Chip>
                  <Note style={{ animationDelay: `${row.at + 980}ms` }} className="a-fade">
                    read from our own data, never asked of the model
                  </Note>
                </>
              )}

              {row.coverage === "GAP" && (
                <Note
                  style={{ animationDelay: `${row.at + 900}ms` }}
                  className="a-fade flex items-center gap-1 font-medium text-foreground"
                >
                  <Lock aria-hidden className="size-3 text-muted-foreground" strokeWidth={2.4} />
                  forced by code — no control mapped, so no coverage may be claimed
                </Note>
              )}
            </div>
          </div>
        ))}
      </div>

      <Note style={{ animationDelay: "2250ms" }} className="a-fade text-center">
        A gap is a finding, not a failure. Reporting a risk as covered with nothing
        behind it would hide the work — which is the one outcome this must never produce.
      </Note>
    </div>
  );
}
