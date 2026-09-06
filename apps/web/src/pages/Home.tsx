import {
  Building2,
  FileSearch,
  Gavel,
  Layers,
  ListChecks,
  Lock,
  Radio,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Hero from "@/components/home/Hero";
import PipelineTheatre from "@/components/home/PipelineTheatre";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useReveal } from "@/lib/useReveal";
import { cn } from "@/lib/utils";

/**
 * The home page: what this thing does, in the order it does it.
 *
 * It carries no counts. Every figure the foundation data could offer — controls,
 * indicators, departments — is seeded demo data, and a landing page whose first
 * impression is a number that is not real is worse than one with no numbers at all.
 * What it does show live is a single honest fact: whether the backend is answering.
 * That one is checkable, which is the whole standard this product holds itself to.
 *
 * The counts still exist, and still matter — they moved to the Foundation page,
 * where they sit next to the library rows they are counting and can be verified by
 * scrolling.
 */
export default function Home() {
  // The only page in the app that renders for a signed-out visitor, so it is also the
  // only one that has to know which of the two it is talking to.
  const { user } = useAuth();

  return (
    <div className="pb-8">
      <Hero authed={!!user} status={<BackendStatus />} />

      <section id="walkthrough" className="scroll-mt-20 pt-12 sm:pt-16">
        <SectionHead
          eyebrow="The process"
          title="One document, six pairs of hands"
          lede="Nothing here is a black box handing back an answer. Each stage produces something the next stage can check, and every stage refuses to do the one thing that would make it untrustworthy."
        />
        <div className="mt-7">
          <PipelineTheatre />
        </div>
      </section>

      <Principles />
      <StartHere />
      <Limits />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function SectionHead({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="max-w-2xl">
      <p
        data-shown={shown}
        className="reveal text-[10px] font-semibold uppercase tracking-[0.18em] text-brand"
      >
        {eyebrow}
      </p>
      <h2
        data-shown={shown}
        style={{ transitionDelay: "70ms" }}
        className="reveal mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]"
      >
        {title}
      </h2>
      {lede && (
        <p
          data-shown={shown}
          style={{ transitionDelay: "140ms" }}
          className="reveal mt-2.5 text-[14px] leading-relaxed text-muted-foreground"
        >
          {lede}
        </p>
      )}
    </div>
  );
}

/**
 * Is the backend answering?
 *
 * The only live figure on this page, and the reason it is here rather than a count:
 * a reader can confirm it themselves in one refresh. When it is down the message
 * says what still works, because that is true — the workflow is designed so the
 * model, and even the API, can be missing without the human being stuck.
 */
function BackendStatus() {
  const [state, setState] = useState<"loading" | "up" | "down">("loading");
  const [service, setService] = useState("");

  useEffect(() => {
    let live = true;
    api
      .health()
      .then((health) => {
        if (!live) return;
        setService(health.service);
        setState("up");
      })
      .catch(() => live && setState("down"));
    return () => {
      live = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <span className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-card/70 px-3 text-[11px] text-muted-foreground backdrop-blur">
        <Radio className="size-3 animate-pulse" />
        Checking the backend…
      </span>
    );
  }

  if (state === "down") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-status-warning/40 bg-status-warning-surface px-3 py-1 text-[11px] text-foreground">
        <TriangleAlert className="size-3 shrink-0 text-status-warning" />
        Backend not answering — start the API and reload. Nothing in the workflow
        depends on it being up to stay reviewable.
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-status-good/30 bg-status-good-surface px-3 py-1 text-[11px] text-foreground">
      <span aria-hidden className="relative flex size-2">
        <span className="a-breathe absolute inline-flex size-full rounded-full bg-status-good" />
        <span className="relative inline-flex size-2 rounded-full bg-status-good" />
      </span>
      Live — talking to <span className="font-mono text-[10.5px]">{service}</span>
    </span>
  );
}

/* ── The rules the product is actually built on ──────────────────────────── */

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: ShieldCheck,
    title: "Citations are verified, never trusted",
    body: "Every claim carries the exact span it came from, and code confirms that span really exists in the stored text. One that cannot be found is flagged — not quietly dropped, and never shown as fact.",
  },
  {
    icon: Gavel,
    title: "The human is enforced, not assumed",
    body: "Nothing reaches published and no obligation reaches closed without a person deciding. That is a state machine, not a convention — so it holds even when everyone is in a hurry.",
  },
  {
    icon: Sparkles,
    title: "The AI never blocks the work",
    body: "If the model is unavailable the screen says so plainly, and every action stays doable by hand. Slow work goes to a background worker so the interface keeps answering.",
  },
  {
    icon: Lock,
    title: "Nothing closes itself",
    body: "Closure needs a second person and something to point at afterwards. The daily sweep raises reminders and moves nothing — a scheduled job advancing work would defeat the whole point.",
  },
  {
    icon: Layers,
    title: "A gap is a finding, not a failure",
    body: "The matrix may never claim more coverage than it can name a control for. Reporting a risk as covered with nothing behind it hides work, which is the most damaging thing it could do.",
  },
  {
    icon: ScrollText,
    title: "Every decision leaves a row",
    body: "AI suggestions and human decisions land in one hash-chained trail, each row's hash covering the row before it — so an altered row and a deleted row fail its check differently.",
  },
];

function Principles() {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <section className="pt-14 sm:pt-20">
      <SectionHead
        eyebrow="Non-negotiables"
        title="Six rules that outrank every feature"
        lede="Each of these is enforced somewhere specific in the code rather than promised in a document. Breaking any one of them silently would break the product's whole claim."
      />
      <div ref={ref} className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((rule, i) => (
          <div
            key={rule.title}
            data-shown={shown}
            style={{ transitionDelay: `${i * 70}ms` }}
            className={cn(
              "reveal group rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow",
              "hover:border-brand-line/45 hover:shadow-md",
            )}
          >
            <span className="grid size-8 place-items-center rounded-lg bg-brand-surface text-brand transition-colors group-hover:bg-brand group-hover:text-primary-foreground">
              <rule.icon className="size-4" strokeWidth={2.1} />
            </span>
            <h3 className="mt-3 text-[13.5px] font-semibold leading-snug text-foreground">
              {rule.title}
            </h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {rule.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Where to go next ────────────────────────────────────────────────────── */

const DESTINATIONS: { to: string; icon: LucideIcon; title: string; body: string }[] = [
  {
    to: "/circulars",
    icon: FileSearch,
    title: "Circulars",
    body: "Upload a PDF and watch it through parsing, analysis and grounding.",
  },
  {
    to: "/foundation",
    icon: Building2,
    title: "Foundation",
    body: "The departments, controls and indicators every later stage reads from.",
  },
  {
    to: "/tracker",
    icon: ListChecks,
    title: "Tracker",
    body: "Obligations with an owner, a deadline, and a closure that needs evidence.",
  },
  {
    to: "/audit",
    icon: ScrollText,
    title: "Audit",
    body: "The hash-chained trail, and the check that walks it end to end.",
  },
];

function StartHere() {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <section className="pt-14 sm:pt-20">
      <SectionHead eyebrow="Start anywhere" title="Where you actually work" />
      <div ref={ref} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DESTINATIONS.map((place, i) => (
          <Link
            key={place.to}
            to={place.to}
            data-shown={shown}
            style={{ transitionDelay: `${i * 70}ms` }}
            className={cn(
              "reveal group flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-all",
              "hover:-translate-y-0.5 hover:border-brand-line/45 hover:shadow-md",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            <span className="flex items-center gap-2">
              <place.icon className="size-4 text-brand" strokeWidth={2.1} />
              <span className="text-[13.5px] font-semibold text-foreground">{place.title}</span>
              <span
                aria-hidden
                className="ml-auto text-brand opacity-0 transition-opacity group-hover:opacity-100"
              >
                &rarr;
              </span>
            </span>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {place.body}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── The parts we say out loud instead of hiding ─────────────────────────── */

const LIMITS = [
  "OCR can misread an italic serif line. The screen marks which pages were machine-read rather than pretending they are equivalent.",
  "Devanagari is dropped, not decoded — the extracted text is the document's English. A repaired-looking Hindi word would be worse than a visible absence.",
  "A PDF whose text layer exists but is garbage is treated as valid text. No heuristic for that was worth its false positives.",
];

function Limits() {
  const [ref, shown] = useReveal<HTMLDivElement>();
  return (
    <section ref={ref} className="pt-14 sm:pt-20">
      <div
        data-shown={shown}
        className="reveal rounded-xl border border-border bg-muted/40 p-5 sm:p-6"
      >
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Said out loud
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-foreground">
          A tool that exists to make claims checkable has no business hiding its own
          limits. These are the three worth knowing before you trust an output.
        </p>
        <ul className="mt-4 grid gap-2.5 sm:grid-cols-3">
          {LIMITS.map((limit, i) => (
            <li
              key={limit}
              data-shown={shown}
              style={{ transitionDelay: `${100 + i * 80}ms` }}
              className="reveal border-l-2 border-brand-line pl-3 text-[12.5px] leading-relaxed text-muted-foreground"
            >
              {limit}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
