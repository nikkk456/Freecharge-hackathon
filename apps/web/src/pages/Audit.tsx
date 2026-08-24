import {
  Bot,
  Cog,
  Link2,
  Loader2,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Unlink,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import Callout from "@/components/Callout";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AuditEntry, type ChainStatus, type User } from "@/lib/api";
import { cn } from "@/lib/utils";

type ActorKind = AuditEntry["actor_kind"];

const ACTOR: Record<ActorKind, { label: string; Icon: typeof UserRound; ring: string }> = {
  HUMAN: { label: "Human", Icon: UserRound, ring: "bg-brand text-primary-foreground" },
  AI: { label: "AI", Icon: Bot, ring: "bg-brand-teal text-white" },
  SYSTEM: { label: "System", Icon: Cog, ring: "bg-muted text-muted-foreground" },
};

export default function Audit() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [chain, setChain] = useState<ChainStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [actor, setActor] = useState<ActorKind | "ALL">("ALL");
  const [people, setPeople] = useState<Map<string, User>>(new Map());

  const load = useCallback(() => {
    Promise.all([api.auditTrail({ limit: 200 }), api.auditVerify()])
      .then(([entries, status]) => {
        setRows(entries);
        setChain(status);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);
  useEffect(() => {
    api
      .users()
      .then((list) => setPeople(new Map(list.map((u) => [u.id, u]))))
      .catch(() => setPeople(new Map()));
  }, []);

  /** Who to credit. AI and SYSTEM rows have no actor_id by design. */
  const nameFor = useCallback(
    (row: AuditEntry): string => {
      if (row.actor_kind === "AI") return "AI model";
      if (row.actor_kind === "SYSTEM") return "Scheduled job";
      if (!row.actor_id) return "Unknown user";
      const u = people.get(row.actor_id);
      return u ? u.full_name : `User ${row.actor_id.slice(0, 8)}`;
    },
    [people],
  );

  /** Swap a stored user id for the person's name wherever one appears in a diff. */
  const resolveId = useCallback(
    (value: unknown): string | null => {
      if (typeof value !== "string") return null;
      const u = people.get(value);
      return u ? u.full_name : null;
    },
    [people],
  );

  const roleFor = useCallback(
    (row: AuditEntry): string | null => {
      if (row.actor_kind !== "HUMAN" || !row.actor_id) return null;
      return people.get(row.actor_id)?.role ?? null;
    },
    [people],
  );

  async function recheck() {
    setChecking(true);
    try {
      const status = await api.auditVerify();
      setChain(status);
      if (status.intact) toast.success("Chain intact", { description: status.detail });
      else toast.error("Chain broken", { description: status.detail });
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Could not verify the chain", { description: message });
    } finally {
      setChecking(false);
    }
  }

  const counts = useMemo(() => {
    const c: Record<ActorKind, number> = { HUMAN: 0, AI: 0, SYSTEM: 0 };
    rows.forEach((r) => (c[r.actor_kind] += 1));
    return c;
  }, [rows]);

  // Newest first reads as a feed; the chain still runs oldest -> newest underneath,
  // so a link is drawn between each row and the one BELOW it (its predecessor).
  const shown = useMemo(
    () => (actor === "ALL" ? rows : rows.filter((r) => r.actor_kind === actor)),
    [rows, actor],
  );

  const intact = chain?.intact ?? true;

  return (
    <div className="space-y-5">
      {/* ── The chain's verdict, stated as loudly as it deserves ─────────── */}
      <section
        className={cn(
          "overflow-hidden rounded-xl border shadow-sm",
          intact ? "border-status-good/30" : "border-status-critical/40",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-5 px-6 py-5",
            intact
              ? "bg-gradient-to-br from-status-good-surface via-card to-brand-teal-surface"
              : "bg-gradient-to-br from-status-critical-surface via-card to-card",
          )}
        >
          <div className="flex min-w-0 items-start gap-4">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl",
                intact
                  ? "bg-status-good text-white"
                  : "bg-status-critical text-white",
              )}
            >
              {intact ? (
                <ShieldCheck className="size-6" strokeWidth={2.2} />
              ) : (
                <ShieldAlert className="size-6" strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0">
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand">
                Stage 4 · Hash-chained audit
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                {chain
                  ? intact
                    ? "Chain intact"
                    : "Chain broken"
                  : "Audit trail"}
              </h1>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {chain?.detail ??
                  "Every AI suggestion and every human decision, append-only."}{" "}
                Each entry's hash covers the one before it, so altering or deleting any entry
                breaks every hash after it.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={() => void recheck()} disabled={checking}>
            {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            {checking ? "Verifying…" : "Verify chain"}
          </Button>
        </div>

        <dl className="grid grid-cols-2 divide-border border-t border-border sm:grid-cols-4 sm:divide-x">
          <Stat label="Entries" value={chain?.total ?? rows.length} Icon={ScrollText} />
          <Stat label="Human decisions" value={counts.HUMAN} Icon={UserRound} />
          <Stat label="AI suggestions" value={counts.AI} Icon={Bot} />
          <Stat label="System actions" value={counts.SYSTEM} Icon={Cog} />
        </dl>
      </section>

      {error && <Callout tone="critical">{error}</Callout>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
          {(["ALL", "HUMAN", "AI", "SYSTEM"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActor(k)}
              aria-pressed={actor === k}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                actor === k ? "bg-card text-brand shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "ALL" ? "All" : ACTOR[k].label}
              <span className="ml-1.5 tabular-nums opacity-60">
                {k === "ALL" ? rows.length : counts[k]}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Newest first · showing up to 200</p>
      </div>

      {/* ── The chain itself, drawn as a chain ───────────────────────────── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={ScrollText}
            title={rows.length === 0 ? "Nothing recorded yet" : "No entries from this actor"}
            description={
              rows.length === 0
                ? "Analyse and approve a circular, and every step lands here."
                : "Try a different actor filter."
            }
          />
        </div>
      ) : (
        <ol className="relative space-y-2">
          {shown.map((row, i) => {
            const broken = !intact && chain?.broken_at_seq === row.seq;
            const isLast = i === shown.length - 1;
            const { Icon, ring } = ACTOR[row.actor_kind];
            return (
              <li key={row.seq} className="relative pl-14">
                {/* The connector to this entry's predecessor. It IS the chain: a
                    row's hash covers the previous row's hash, so a break here
                    means a row was altered, deleted or inserted. */}
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-[1.375rem] top-11 h-[calc(100%+0.5rem)] w-px",
                      broken ? "bg-status-critical" : "bg-border",
                    )}
                  />
                )}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-3 flex size-11 items-center justify-center rounded-xl ring-4 ring-background",
                    ring,
                  )}
                >
                  <Icon className="size-[18px]" strokeWidth={2.2} />
                </span>

                <article
                  className={cn(
                    "rounded-xl border bg-card p-4 shadow-sm transition-colors",
                    broken
                      ? "border-status-critical/50 bg-status-critical-surface"
                      : "border-border hover:border-brand-line/30",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-foreground">
                      <span className="font-mono text-2xs text-muted-foreground">
                        #{row.seq}
                      </span>
                      <span className="font-semibold">{nameFor(row)}</span>
                      {roleFor(row) && (
                        <span className="rounded bg-brand-surface px-1.5 py-0.5 text-2xs font-medium capitalize text-brand">
                          {roleFor(row)}
                        </span>
                      )}
                      <span className="text-muted-foreground">{verb(row.action)}</span>
                      <span className="font-medium">{row.entity_type.replace(/_/g, " ")}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                        {row.entity_id.slice(0, 8)}
                      </span>
                    </h2>
                    <time className="text-2xs tabular-nums text-muted-foreground">
                      {new Date(row.created_at).toLocaleString()}
                    </time>
                  </div>

                  <p className="mt-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground/80">
                    {row.action}
                  </p>

                  <Change before={row.before} after={row.after} resolve={resolveId} />

                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2.5 font-mono text-2xs">
                    {broken ? (
                      <Unlink aria-hidden className="size-3 text-status-critical" />
                    ) : (
                      <Link2 aria-hidden className="size-3 text-status-good" />
                    )}
                    <span className="text-muted-foreground">prev</span>
                    <span className="text-muted-foreground/70">
                      {row.prev_hash ? `${row.prev_hash.slice(0, 12)}…` : "genesis"}
                    </span>
                    <span className="text-muted-foreground/40">→</span>
                    <span className="text-muted-foreground">hash</span>
                    <span
                      className={cn(
                        "rounded px-1 py-0.5",
                        broken
                          ? "bg-status-critical/15 text-status-critical"
                          : "bg-muted text-foreground",
                      )}
                      title={row.hash}
                    >
                      {row.hash.slice(0, 12)}…
                    </span>
                  </div>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Turn the stored action enum into something that reads in a sentence. */
const VERBS: Record<string, string> = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  PUBLISHED: "published",
  CLOSED: "closed",
  REOPENED: "reopened",
  STATUS_CHANGED: "moved",
  ASSIGNED: "assigned",
  OVERDUE_REMINDER: "flagged",
  SUGGESTED: "suggested",
  GENERATED: "generated",
  HUMAN_EDITED: "edited",
  AI_SUGGESTED: "drafted",
  AI_GENERATED: "generated",
  APPROVED: "approved",
  SUPERSEDED: "superseded",
};

function verb(action: string): string {
  return VERBS[action] ?? action.toLowerCase().replace(/_/g, " ");
}

function Stat({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number;
  Icon: typeof UserRound;
}) {
  return (
    <div className="bg-card px-6 py-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5 text-brand" />
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold leading-none tabular-nums tracking-tight text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

function Change({
  before,
  after,
  resolve,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  resolve: (value: unknown) => string | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  if (keys.length === 0) return null;

  return (
    <dl className="mt-2 space-y-1">
      {keys.slice(0, 6).map((key) => (
        <div key={key} className="flex flex-wrap items-baseline gap-1.5 text-xs">
          <dt className="font-mono text-2xs text-muted-foreground">{key}</dt>
          {before && key in before && (
            <>
              <dd className="text-muted-foreground/60 line-through">
                {resolve(before[key]) ?? format(before[key])}
              </dd>
              <span aria-hidden className="text-muted-foreground/40">
                →
              </span>
            </>
          )}
          <dd className="font-medium text-foreground">
            {resolve(after?.[key]) ?? format(after?.[key])}
          </dd>
        </div>
      ))}
      {keys.length > 6 && (
        <div className="text-2xs text-muted-foreground">+{keys.length - 6} more fields</div>
      )}
    </dl>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  const text = String(value);
  return text.length > 90 ? `${text.slice(0, 90)}…` : text;
}
