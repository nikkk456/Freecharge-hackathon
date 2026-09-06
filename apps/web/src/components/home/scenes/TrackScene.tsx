import { Bell, Check, Clock, Paperclip, Unlock, UserCheck } from "lucide-react";
import { StatusGlyph } from "@/components/StatusGlyph";
import { Chip, Mono, Note } from "./parts";

/**
 * Stage 6, animated: an extracted obligation, carried to a closure a regulator
 * would accept.
 *
 * The track is drawn as a track because the state machine really is data — the
 * legal moves live in one table that both the API enforces and the UI reads, so
 * the buttons a user sees cannot offer a move the server would reject.
 *
 * Two beats carry the stage. The gate before CLOSED is maker–checker: closure is
 * reachable only from SUBMITTED, only by a reviewer, and only with something to
 * point at afterwards — "never auto-close" is meaningless unless closing is
 * *impossible* without evidence. And the sweep at the bottom rings a bell without
 * touching the track, because a scheduled job that advanced work would break the
 * rule that nothing progresses without a person.
 *
 * Note the palette: the four states use neutral tones, never the RAG ramp. Progress
 * is not health. Lateness is, so the overdue card is the only one wearing a status
 * colour — and an item is allowed to be in progress *and* late at once, which is
 * exactly why OVERDUE is not one of the states.
 */

const STOPS = [
  { label: "Open", at: 300, style: "bg-muted text-muted-foreground ring-1 ring-inset ring-border" },
  { label: "In progress", at: 800, style: "bg-foreground/85 text-background" },
  {
    label: "Submitted",
    at: 1300,
    style: "bg-secondary text-secondary-foreground ring-1 ring-inset ring-border",
  },
];

export default function TrackScene() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <div className="a-rise flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          Restrict recovery calls to the 8:00 a.m. – 7:00 p.m. window
        </span>
        <Chip tone="muted">F06</Chip>
        <Mono>due 30 Sep</Mono>
      </div>

      {/* The state machine. */}
      <div className="scroll-slim overflow-x-auto pb-1">
        <div className="flex min-w-[19rem] items-center gap-1">
          {STOPS.map((stop, i) => (
            <div key={stop.label} className="flex shrink-0 items-center gap-1">
              {i > 0 && (
                <span
                  aria-hidden
                  style={{ animationDelay: `${stop.at - 200}ms` }}
                  className="a-draw-x h-px w-4 bg-brand sm:w-7"
                />
              )}
              <span
                style={{ animationDelay: `${stop.at}ms` }}
                className={`a-pop whitespace-nowrap rounded-full px-2 py-1 text-[9.5px] font-semibold ${stop.style}`}
              >
                {stop.label}
              </span>
            </div>
          ))}

          {/* The gate. Nothing crosses it on time alone. */}
          <span
            aria-hidden
            style={{ animationDelay: "1450ms" }}
            className="a-draw-x h-px w-3 bg-brand sm:w-5"
          />
          <span
            style={{ animationDelay: "1550ms" }}
            className="a-pop flex shrink-0 items-center gap-1 rounded-md border border-dashed border-brand-line bg-brand-surface px-1.5 py-1"
          >
            <Unlock aria-hidden className="size-2.5 text-brand" strokeWidth={2.6} />
            <span className="whitespace-nowrap text-[8.5px] font-bold uppercase tracking-[0.1em] text-brand">
              Maker–checker
            </span>
          </span>
          <span
            aria-hidden
            style={{ animationDelay: "2400ms" }}
            className="a-draw-x h-px w-3 bg-brand sm:w-5"
          />

          <span
            style={{ animationDelay: "2550ms" }}
            className="a-pop flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-card px-2 py-1 text-[9.5px] font-semibold text-muted-foreground ring-1 ring-inset ring-border"
          >
            <Check aria-hidden className="size-2.5 text-status-good" strokeWidth={3} />
            Closed
          </span>
        </div>
      </div>

      {/* What the gate actually checks. Both, or the move does not exist. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip icon={UserCheck} tone="brand" style={{ animationDelay: "1800ms" }} className="a-pop">
          Reviewer, not the person who did the work
        </Chip>
        <Chip icon={Paperclip} tone="brand" style={{ animationDelay: "2000ms" }} className="a-pop">
          Evidence attached
        </Chip>
        <Note style={{ animationDelay: "2200ms" }} className="a-fade">
          both, or the transition is not offered and not accepted
        </Note>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Lateness is health, so this one card is allowed a status colour. */}
        <div
          style={{ animationDelay: "2800ms" }}
          className="a-rise-sm rounded-lg border border-border bg-card p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-foreground/85 px-2 py-0.5 text-[9px] font-semibold text-background">
              In progress
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-status-critical/30 bg-status-critical-surface px-1.5 py-0.5 text-[9px] font-semibold text-foreground">
              <StatusGlyph tone="critical" className="size-3" />
              Past due
            </span>
          </div>
          <Note className="mt-1.5">
            Overdue is computed from the due date, never written into the status —
            recording it would destroy the only record of what is actually happening
            to the item.
          </Note>
        </div>

        {/* The cron. Loud, and completely powerless. */}
        <div
          style={{ animationDelay: "3000ms" }}
          className="a-rise-sm rounded-lg border border-border bg-card p-2.5"
        >
          <div className="flex items-center gap-1.5">
            <Chip icon={Clock} tone="muted">
              08:00 daily sweep
            </Chip>
            <Bell
              aria-hidden
              style={{ animationDelay: "3300ms" }}
              className="a-pop size-3.5 text-brand"
              strokeWidth={2.4}
            />
          </div>
          <Note className="mt-1.5">
            It sends the reminder, writes its own audit row, and changes no status.
            Run twice in a day it notifies nobody twice.
          </Note>
        </div>
      </div>

      <Note style={{ animationDelay: "3400ms" }} className="a-fade text-center">
        Nothing here closes itself. Every step across this track is a person, on the
        record.
      </Note>
    </div>
  );
}
