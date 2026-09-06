import { ArrowDown, FileText, Grid3x3, Highlighter, ListChecks, LogIn, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePrefersReducedMotion } from "@/lib/useReveal";

/**
 * The opening statement, and one picture of the whole idea.
 *
 * What the picture is arguing: these are not four screens a user visits, they are
 * four layers of the same document, and a single thread runs from the circular at
 * the top to the closed obligation at the bottom. The pulse travelling down that
 * thread is the point — a conclusion at the bottom can always be walked back up to
 * the line of text at the top.
 *
 * Deliberately not a statistic. A tool whose entire argument is "you can check
 * this" should not open with a number nobody can check — the same reasoning that
 * put a grounded claim rather than a counter on the sign-in screen.
 */

const LAYERS = [
  { icon: FileText, label: "The circular", tint: "border-brand-line/50 bg-card" },
  { icon: Highlighter, label: "Grounded analysis", tint: "border-brand-line/50 bg-brand-surface" },
  { icon: Grid3x3, label: "Risk & control matrix", tint: "border-brand-teal/30 bg-brand-teal-surface" },
  { icon: ListChecks, label: "Tracked obligations", tint: "border-brand-line/50 bg-card" },
];

export default function Hero({
  status,
  authed,
}: {
  status?: React.ReactNode;
  /** A visitor and a signed-in user want different things from the same button.
   *  "Upload a circular" that lands on a login form is a small lie; a visitor is
   *  told what the next step actually is. */
  authed: boolean;
}) {
  const reduced = usePrefersReducedMotion();

  function toWalkthrough() {
    document.getElementById("walkthrough")?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "start",
    });
  }

  return (
    <section className="relative -mx-6 -mt-8 overflow-hidden border-b border-border px-6 pb-12 pt-10 sm:pb-16 sm:pt-14">
      {/* Ground. Two brand glows breathing out of phase, over a hairline grid — the
          same decorative language as the sign-in panel, at a fraction of the volume
          because this page has to stay readable underneath it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-surface/70 via-background to-brand-teal-surface/60" />
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 90% 70% at 50% 0%, #000 30%, transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 70% at 50% 0%, #000 30%, transparent 75%)",
          }}
        />
        <div className="a-breathe absolute -left-24 -top-24 size-80 rounded-full bg-brand/15 blur-3xl" />
        <div
          className="a-breathe absolute -right-16 top-20 size-72 rounded-full bg-brand-teal/15 blur-3xl"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:gap-14">
        <div className="min-w-0">
          <p className="a-rise-sm inline-flex items-center gap-2 rounded-full border border-brand-line/50 bg-card/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand backdrop-blur">
            Compliance Advisory Copilot
          </p>

          <h1
            style={{ animationDelay: "80ms" }}
            className="a-rise mt-4 text-[2.1rem] font-semibold leading-[1.1] tracking-tight text-foreground sm:text-[2.75rem]"
          >
            From circular
            <br />
            to closure.
          </h1>

          <p
            style={{ animationDelay: "180ms" }}
            className="a-rise mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground"
          >
            Upload an RBI or SEBI circular and read back a rated, departmental analysis
            where <span className="font-medium text-foreground">every claim carries the
            span of text it came from</span> — checked against the document, not taken on
            trust. A person approves it. What follows is a control matrix and a list of
            obligations that no one can close alone.
          </p>

          <div
            style={{ animationDelay: "280ms" }}
            className="a-rise mt-7 flex flex-wrap items-center gap-2.5"
          >
            <Button asChild size="lg">
              {authed ? (
                <Link to="/circulars">
                  <Upload className="size-4" />
                  Upload a circular
                </Link>
              ) : (
                <Link to="/login">
                  <LogIn className="size-4" />
                  Sign in to start
                </Link>
              )}
            </Button>
            <Button variant="outline" size="lg" onClick={toWalkthrough}>
              <ArrowDown className="size-4" />
              Watch it work
            </Button>
          </div>

          {status && (
            <div style={{ animationDelay: "400ms" }} className="a-fade mt-5">
              {status}
            </div>
          )}
        </div>

        {/* The four layers, and the thread through them. */}
        <div aria-hidden className="relative mx-auto hidden h-[19rem] w-full max-w-[21rem] md:block">
          <span className="absolute left-[2.05rem] top-6 h-[13.5rem] w-px bg-gradient-to-b from-brand/50 via-brand/25 to-transparent" />
          <span
            className="a-travel absolute left-[calc(2.05rem-2px)] top-6 size-[5px] rounded-full bg-brand shadow-[0_0_0_3px_hsl(var(--brand)/0.18)]"
            style={{ "--travel": "13rem" } as React.CSSProperties}
          />

          {LAYERS.map((layer, i) => (
            <div
              key={layer.label}
              style={{ top: `${i * 4.6}rem`, animationDelay: `${300 + i * 110}ms` }}
              className="a-rise absolute inset-x-0"
            >
              <div
                className="a-float"
                style={{ animationDelay: `${i * 0.8}s`, paddingLeft: `${i * 0.55}rem` }}
              >
                <div
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-md backdrop-blur-sm ${layer.tint}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand text-primary-foreground">
                    <layer.icon className="size-3.5" strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] font-semibold text-foreground">
                      {layer.label}
                    </p>
                    <span className="mt-1 flex gap-1">
                      <span className="h-[3px] w-10 rounded-full bg-foreground/15" />
                      <span className="h-[3px] w-6 rounded-full bg-foreground/10" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
