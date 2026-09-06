import { AlertTriangle, ArrowDown, Check, Quote, Sparkles } from "lucide-react";
import { Chip, Mono, Note } from "./parts";

/**
 * Stage 3, animated — and the reason the whole product is worth building.
 *
 * Three claims are made by this scene, in order:
 *
 * 1. The model returns a QUOTE, never an offset. Asking a model for character
 *    positions and then checking them means trusting the thing under test; models
 *    invent plausible offsets freely. Quoting is the one part of this they are
 *    reliable at, so it is the only part we ask for.
 * 2. Finding that quote cannot be a substring search. PDFs wrap sentences, so the
 *    model's quote has a space exactly where the stored text has a newline — which
 *    is why the highlight below deliberately crosses a line break, and why the tier
 *    that found it is recorded rather than hidden.
 * 3. A claim whose quote cannot be found is still shown, and marked. Dropping it
 *    would conceal that the model asserted something it could not support, which
 *    is the failure this feature exists to make impossible.
 *
 * The second claim is not padding. A grounding demo that only ever succeeds is
 * indistinguishable from one that never checks.
 */

const TIERS = ["exact", "normalised", "case-insensitive", "not found"];

export default function GroundScene() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-2.5">
      {/* The claim, and the evidence the model offered for it. */}
      <div className="rounded-lg border border-brand-line/45 bg-brand-surface/50 p-2.5 sm:p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={Sparkles} className="a-pop">
            Risk rating · High
          </Chip>
          <Note style={{ animationDelay: "200ms" }} className="a-fade">
            the model&rsquo;s claim
          </Note>
        </div>
        <p
          style={{ animationDelay: "420ms" }}
          className="a-fade mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-foreground"
        >
          <Quote aria-hidden className="mt-px size-3 shrink-0 text-brand/60" strokeWidth={2.5} />
          <span>
            outside the hours of 8:00 a.m. and 7:00 p.m.
            <Mono className="ml-1.5 text-brand/70">← quoted, not located</Mono>
          </span>
        </p>
      </div>

      {/* The search. Our code does this part; the model is not consulted again. */}
      <div className="flex items-center justify-center gap-2">
        <span
          aria-hidden
          style={{ animationDelay: "800ms" }}
          className="a-draw-y h-3.5 w-px bg-brand-line"
        />
        <Note style={{ animationDelay: "880ms" }} className="a-fade flex items-center gap-1">
          <ArrowDown aria-hidden className="size-3" />
          searched against the stored text — whitespace collapsed, line breaks rejoined
        </Note>
      </div>

      {/* The document. Serif, because this is the circular speaking and not us. The
          highlight crosses the wrap on purpose: that break is the whole reason a
          plain substring search would have missed this. */}
      <div className="rounded-md border border-brand-line/40 bg-card p-3 shadow-sm">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          The circular
        </p>
        <p className="font-serif text-[12.5px] leading-[1.85] text-foreground">
          &hellip;recovery agents shall not contact the borrower{" "}
          <span
            style={{ animationDelay: "1350ms", "--sweep": "var(--highlight)" } as React.CSSProperties}
            className="a-sweep rounded-sm px-0.5"
          >
            outside the hours of 8:00 a.m.
          </span>
          <br />
          <span
            style={{ animationDelay: "1450ms", "--sweep": "var(--highlight)" } as React.CSSProperties}
            className="a-sweep rounded-sm px-0.5"
          >
            and 7:00 p.m.
          </span>
          , nor shall they resort to intimidation&hellip;
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip icon={Check} tone="good" style={{ animationDelay: "2050ms" }} className="a-pop">
          Verified
        </Chip>
        <Mono style={{ animationDelay: "2150ms" }} className="a-fade">
          char 4182 – 4241
        </Mono>
        {/* Which tier found it is stored, so "we found it" is never a bare claim. */}
        <span className="ml-auto flex items-center gap-1">
          {TIERS.map((tier, i) => (
            <span
              key={tier}
              style={{ animationDelay: `${2250 + i * 70}ms` }}
              className={
                i === 1
                  ? "a-fade rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground"
                  : "a-fade rounded-full px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground/60"
              }
            >
              {tier}
            </span>
          ))}
        </span>
      </div>

      {/* The claim that could not be grounded. It is not removed — it is marked. */}
      <div
        style={{ animationDelay: "2700ms" }}
        className="a-rise-sm flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-status-warning/40 bg-status-warning-surface/50 px-2.5 py-2"
      >
        <Chip icon={Sparkles} tone="muted">
          Obligation · quarterly agency list
        </Chip>
        <Mono className="italic">no matching span in this document</Mono>
        <Chip
          icon={AlertTriangle}
          tone="warning"
          style={{ animationDelay: "3150ms" }}
          className="a-pop ml-auto"
        >
          Unverified · flagged
        </Chip>
      </div>

      <Note style={{ animationDelay: "3400ms" }} className="a-fade text-center">
        An unverifiable citation is flagged, never presented as fact. That is the
        difference between a summary and a piece of evidence.
      </Note>
    </div>
  );
}
