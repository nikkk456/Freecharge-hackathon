import { Check, Link2, Lock, PenLine, ShieldCheck, UserCheck } from "lucide-react";
import { Chip, Mono, Note } from "./parts";

/**
 * Stage 4, animated: a person changes the draft, a different person signs it, and
 * both facts become a row that cannot be quietly rewritten.
 *
 * The three beats are deliberately inseparable, because none of them means much
 * alone. An approval needs a named person; a person needs something they were
 * actually able to change; and a change needs a record. A screen with only the
 * first is a rubber stamp, only the second is a text editor, only the third is a
 * log nobody reads.
 *
 * The lock at the end is not decoration. Once published, every edit path returns
 * 409 — an approval that could be silently rewritten afterwards is not an approval.
 */

const CHAIN = [
  { hash: "a41f9c", label: "AI suggested", at: 2600 },
  { hash: "7c02be", label: "Human edited", at: 2850 },
  { hash: "e93b17", label: "Human published", at: 3100 },
];

export default function ReviewScene() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-3">
      <div className="a-rise rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
        {/* The human's edit. The old value stays visible, struck — a review screen
            that silently swallows what it replaced is not showing a change. */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Risk rating
          </span>
          <span
            style={{ animationDelay: "300ms" }}
            className="a-fade rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground/70 line-through"
          >
            High
          </span>
          <span aria-hidden className="text-muted-foreground">
            &rarr;
          </span>
          <span
            style={{ animationDelay: "650ms" }}
            className="a-pop rounded border border-status-critical/35 bg-status-critical-surface px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-status-critical"
          >
            Critical
          </span>
          <Chip icon={PenLine} tone="muted" style={{ animationDelay: "820ms" }} className="a-fade">
            edited by a reviewer
          </Chip>
        </div>

        {/* Who may sign. Two rows, because the rule is about the gap between them. */}
        <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
          <Row
            initials="AS"
            name="Asha · analyst"
            at={1200}
            action={
              <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground/70">
                <Lock aria-hidden className="size-2.5" strokeWidth={2.5} />
                Cannot approve
              </span>
            }
          />
          <Row
            initials="RM"
            name="Ravi · reviewer"
            at={1450}
            action={
              <span
                style={{ animationDelay: "1750ms" }}
                className="a-halo inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground shadow-sm"
              >
                <Check aria-hidden className="size-2.5" strokeWidth={3} />
                Approve
              </span>
            }
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70 line-through">
            Draft
          </span>
          <span aria-hidden className="text-muted-foreground">
            &rarr;
          </span>
          <span
            style={{ animationDelay: "2150ms" }}
            className="a-pop rounded bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary-foreground"
          >
            Published
          </span>
          <Chip icon={Lock} tone="muted" style={{ animationDelay: "2350ms" }} className="a-pop">
            frozen — every edit path now refuses
          </Chip>
        </div>
      </div>

      {/* The trail. Each row's hash is taken over its own content *and* the hash
          before it, so a deleted row and an altered row fail in different ways. */}
      <div>
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Audit trail
        </p>
        <div className="flex items-center gap-0">
          {CHAIN.map((row, i) => (
            <div key={row.hash} className="flex min-w-0 flex-1 items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  style={{ animationDelay: `${row.at - 130}ms` }}
                  className="a-draw-x h-px w-3 shrink-0 bg-brand-line sm:w-5"
                />
              )}
              <div
                style={{ animationDelay: `${row.at}ms` }}
                className="a-pop min-w-0 flex-1 rounded-md border border-brand-line/45 bg-brand-surface/60 px-2 py-1.5"
              >
                <div className="flex items-center gap-1">
                  <Link2 aria-hidden className="size-2.5 shrink-0 text-brand" strokeWidth={2.5} />
                  <Mono className="truncate text-brand">{row.hash}</Mono>
                </div>
                <p className="mt-0.5 truncate text-[9.5px] text-muted-foreground">{row.label}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Chip icon={ShieldCheck} tone="good" style={{ animationDelay: "3400ms" }} className="a-pop">
            Chain verified
          </Chip>
          <Note style={{ animationDelay: "3500ms" }} className="a-fade">
            Each hash covers the row before it — so an altered row and a deleted row
            break the chain in two different, distinguishable ways.
          </Note>
        </div>
      </div>
    </div>
  );
}

function Row({
  initials,
  name,
  at,
  action,
}: {
  initials: string;
  name: string;
  at: number;
  action: React.ReactNode;
}) {
  return (
    <div style={{ animationDelay: `${at}ms` }} className="a-slide flex items-center gap-2">
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded bg-brand-surface-strong text-[9px] font-bold text-brand"
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-[10.5px] text-foreground">
        <UserCheck aria-hidden className="size-3 shrink-0 text-muted-foreground" />
        {name}
      </span>
      {action}
    </div>
  );
}
