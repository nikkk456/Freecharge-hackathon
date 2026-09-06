import {
  FileText,
  Grid3x3,
  Highlighter,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
  Signature,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion, useReveal } from "@/lib/useReveal";
import { cn } from "@/lib/utils";
import AnalyseScene from "./scenes/AnalyseScene";
import GroundScene from "./scenes/GroundScene";
import IngestScene from "./scenes/IngestScene";
import RcmScene from "./scenes/RcmScene";
import ReviewScene from "./scenes/ReviewScene";
import TrackScene from "./scenes/TrackScene";

/**
 * The whole product, one stage at a time, playing itself.
 *
 * Why a driven walkthrough rather than six diagrams down the page: the stages are
 * not six features, they are one document moving through six hands, and the thing a
 * reader needs to leave with is the *order*. A page of static panels invites them to
 * skim it as a feature list; a stage that visibly hands off to the next one does not.
 *
 * Three rules, all of them really the same rule — never trap the reader:
 *
 * - Autoplay pauses the moment a pointer or the keyboard enters the component, and
 *   there is a real pause control rather than a hover-only accident.
 * - Choosing a stage stops the carousel for good. Someone who has started steering is
 *   not asking to be moved along, and yanking the page elsewhere mid-read is the
 *   single worst thing a carousel does.
 * - Under `prefers-reduced-motion` it does not advance at all and every scene renders
 *   its finished frame, so the walkthrough degrades into six tabs — a fine thing to be.
 *
 * The rail is a real tablist: arrow keys move between stages, Home and End jump to the
 * ends. A control that answered only to a mouse would be unreachable by exactly the
 * people the summary is most useful to.
 */

type Stage = {
  id: string;
  name: string;
  icon: LucideIcon;
  lede: string;
  /** The non-negotiable this stage exists to enforce, written as a claim we would be
   *  willing to be held to — because that is what these are. */
  rule: string;
  scene: () => JSX.Element;
  /** How long this stage holds before autoplay advances. Denser scenes get longer:
   *  the dwell has to cover the animation plus time to actually read the result. */
  dwell: number;
};

const STAGES: Stage[] = [
  {
    id: "ingest",
    name: "Ingest",
    icon: FileText,
    lede: "A circular arrives as a PDF and is judged page by page — the typed body read straight from its text layer, a scanned annexure handed to OCR. Both empty into one string of text.",
    rule: "OCR runs locally. The document never leaves the environment.",
    scene: () => <IngestScene />,
    dwell: 10000,
  },
  {
    id: "analyse",
    name: "Analyse",
    icon: Sparkles,
    lede: "The model reads that text and drafts the analysis: a summary, a risk rating, the departments it lands on, and every obligation it creates.",
    rule: "The model proposes. It has no path to published.",
    scene: () => <AnalyseScene />,
    dwell: 11000,
  },
  {
    id: "ground",
    name: "Ground",
    icon: Highlighter,
    lede: "Every claim carries a quote, and our code — never the model — finds that quote in the stored text and records the exact character span it occupies.",
    rule: "An unverifiable citation is flagged, never shown as fact.",
    scene: () => <GroundScene />,
    dwell: 12000,
  },
  {
    id: "review",
    name: "Review",
    icon: Signature,
    lede: "A person edits anything they disagree with, and a second person approves it. Both acts become rows in a hash-chained trail that cannot be quietly rewritten.",
    rule: "Published is frozen. Every edit path then refuses.",
    scene: () => <ReviewScene />,
    dwell: 12000,
  },
  {
    id: "rcm",
    name: "Map",
    icon: Grid3x3,
    lede: "Each risk the circular creates is matched against the controls you already own, and the indicator behind a matched control is read from your own data.",
    rule: "A row may never claim more coverage than it can point at.",
    scene: () => <RcmScene />,
    dwell: 11500,
  },
  {
    id: "track",
    name: "Close",
    icon: ListChecks,
    lede: "Every obligation gets an owner, a deadline and a status, then travels a state machine that will not let it be signed off by the person who did the work.",
    rule: "Closure needs a different person, and something to point at.",
    scene: () => <TrackScene />,
    dwell: 12000,
  },
];

export default function PipelineTheatre() {
  const [ref, shown] = useReveal<HTMLDivElement>("-20% 0px");
  const reduced = usePrefersReducedMotion();

  const [active, setActive] = useState(0);
  // Bumped on every stage change and on Replay, and used as the scene's React key, so
  // the scene remounts and its CSS animations start from the first frame again.
  // Without it, coming back to a stage would show only the finished still.
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [hovered, setHovered] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const go = useCallback((index: number) => {
    setActive(((index % STAGES.length) + STAGES.length) % STAGES.length);
    setRun((n) => n + 1);
  }, []);

  // `reduced` decides where autoplay STARTS, not whether it is allowed. Gating the
  // running state on it too meant the Play button silently did nothing for anyone
  // with the preference set — a dead control is worse than the motion they were
  // avoiding, and pressing Play is an explicit request that outranks a default.
  // The scenes' own animations stay suppressed either way; that part is CSS.
  const running = playing && shown && !hovered;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => go(active + 1), STAGES[active].dwell);
    return () => window.clearTimeout(timer);
  }, [running, active, run, go]);

  function onKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowDown: active + 1,
      ArrowRight: active + 1,
      ArrowUp: active - 1,
      ArrowLeft: active - 1,
      Home: 0,
      End: STAGES.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPlaying(false);
    const index = ((next % STAGES.length) + STAGES.length) % STAGES.length;
    go(index);
    tabs.current[index]?.focus();
  }

  const stage = STAGES[active];

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={() => setHovered(false)}
      className="grid gap-4 lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:gap-6"
    >
      {/* ── The rail ──────────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="How a circular moves through the system"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="scroll-slim relative flex gap-1 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0"
        >
          {/* The thread joining the stages, and how far along it we are. Hidden on
              narrow screens, where the rail becomes a horizontal strip instead. */}
          <span
            aria-hidden
            className="absolute bottom-5 left-[1.4rem] top-5 hidden w-px bg-border lg:block"
          />
          <span
            aria-hidden
            className="absolute left-[1.4rem] top-5 hidden w-px bg-brand transition-[height] duration-500 ease-out lg:block"
            style={{ height: `calc((100% - 2.5rem) * ${active / (STAGES.length - 1)})` }}
          />

          {STAGES.map((item, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabs.current[i] = node;
                }}
                role="tab"
                id={`stage-tab-${item.id}`}
                aria-selected={on}
                aria-controls="stage-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => {
                  setPlaying(false);
                  go(i);
                }}
                className={cn(
                  "relative z-10 flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors lg:w-full",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  on ? "bg-brand-surface" : "hover:bg-muted",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full border text-[10px] font-bold transition-colors",
                    on
                      ? "border-brand bg-brand text-primary-foreground"
                      : done
                        ? "border-brand bg-card text-brand"
                        : "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <item.icon className="size-3" strokeWidth={2.6} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-[13px] font-semibold transition-colors",
                    on ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* The active stage in words. Only ever one, so the reader is never also
            choosing what to read. Keyed on the run so it re-enters with its scene. */}
        <div key={`lede-${run}`} className="mt-3 lg:mt-5 lg:pl-2">
          <p className="a-fade text-[13px] leading-relaxed text-muted-foreground">{stage.lede}</p>
          <p
            style={{ animationDelay: "150ms" }}
            className="a-rise-sm mt-3 border-l-2 border-brand pl-2.5 text-[12.5px] font-medium leading-snug text-foreground"
          >
            {stage.rule}
          </p>
        </div>

        <div className="mt-4 flex items-center gap-2 lg:pl-2">
          <TheatreButton
            onClick={() => setPlaying((p) => !p)}
            label={playing ? "Pause the walkthrough" : "Play the walkthrough"}
          >
            {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
            {playing ? "Pause" : "Play"}
          </TheatreButton>
          <TheatreButton onClick={() => setRun((n) => n + 1)} label="Replay this stage">
            <RotateCcw className="size-3" />
            Replay
          </TheatreButton>
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {active + 1} / {STAGES.length}
          </span>
        </div>
      </div>

      {/* ── The stage ─────────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div
          role="tabpanel"
          id="stage-panel"
          aria-labelledby={`stage-tab-${stage.id}`}
          className="relative flex min-h-[26rem] flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:h-[27rem] lg:min-h-0"
          style={{
            backgroundImage: "radial-gradient(hsl(var(--border)) 0.9px, transparent 0.9px)",
            backgroundSize: "18px 18px",
          }}
        >
          {/* A fixed height on large screens, not a minimum. The panel sits in a grid
              row with the rail, so a stretched panel would take the rail's height and
              the height would then change with the length of each stage's description
              — the frame visibly resizing under an autoplaying scene. Content is
              centred inside it instead. The scenes measure well under this, and the
              headroom is deliberate. */}
          <div
            key={`${stage.id}-${run}`}
            className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col"
          >
            {stage.scene()}
          </div>
        </div>

        {/* The dwell, made visible — a carousel that moves without warning feels
            broken, while the same carousel with a filling bar reads as deliberate —
            and, beside it, the one disclaimer this walkthrough needs. It sits on the
            frame's own edge rather than in a footnote at the bottom of the page: a
            caveat you have to scroll to find is not really a caveat. It was inside
            the frame first, where it collided with whatever each scene put in its
            top corner. */}
        <div className="mt-2 flex items-center gap-3">
          <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-border/70">
            {running ? (
              <span
                key={`bar-${run}`}
                className="a-fill block h-full w-full rounded-full bg-brand"
                style={{ animationDuration: `${stage.dwell}ms`, animationTimingFunction: "linear" }}
              />
            ) : (
              <span className="block h-full w-0" />
            )}
          </div>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Worked example
          </span>
        </div>
      </div>
    </div>
  );
}

function TheatreButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}
    </button>
  );
}
