import { Building2, FileText, ListChecks, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ControlDetailDialog from "@/components/ControlDetailDialog";
import EmptyState from "@/components/EmptyState";
import { StatusGlyph } from "@/components/StatusGlyph";
import StatusChip, { statusColor, statusLabel, statusTone } from "@/components/StatusChip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type ControlOut, type KciOut, type LibraryStats, type RagStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

type Load = "loading" | "ok" | "error";
type Filter = "all" | RagStatus;

const SETUP_COMMANDS = [
  "docker compose up -d db redis minio",
  "uvicorn app.main:app --reload",
  "python -m scripts.seed",
];

const ORDER: RagStatus[] = ["green", "amber", "red"];

/** Rank worst-first, so the attention list leads with what is actually failing. */
const SEVERITY: Record<RagStatus, number> = { red: 0, amber: 1, green: 2 };

// Stage 0 screen: proves the whole stack is live end to end — browser -> API ->
// Postgres -> seeded foundation data. Everything shown here is read from the DB;
// nothing is hard-coded in the frontend.
export default function Home() {
  const [state, setState] = useState<Load>("loading");
  const [error, setError] = useState("");
  const [service, setService] = useState("");
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [controls, setControls] = useState<ControlOut[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Which control the reader has opened. Held by id, not by object, so the card
  // re-reads from `controls` and a refresh cannot leave a stale record on screen.
  const [openControl, setOpenControl] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.health(), api.stats(), api.controls()])
      .then(([health, s, c]) => {
        setService(health.service);
        setStats(s);
        setControls(c);
        setState("ok");
      })
      .catch((e: Error) => {
        setError(e.message);
        setState("error");
      });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return controls.filter((c) => {
      if (filter !== "all" && c.kcis[0]?.status !== filter) return false;
      if (!q) return true;
      return [c.code, c.name, c.description ?? "", c.owner_function?.name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [controls, query, filter]);

  // Everything currently off target, worst first — the actual work list.
  const attention = useMemo(
    () =>
      controls
        .flatMap((c) =>
          c.kcis
            .filter((k) => k.status !== "green")
            .map((k) => ({ control: c, kci: k })),
        )
        .sort((a, b) => SEVERITY[a.kci.status] - SEVERITY[b.kci.status]),
    [controls],
  );

  if (state === "loading") return <HomeSkeleton />;

  if (state === "error") {
    return (
      <div className="rounded-xl border border-status-critical/30 bg-card p-6">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <StatusGlyph tone="critical" />
          Backend not reachable
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start the API and make sure Postgres is up, then reload.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
          {error}
        </pre>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SETUP_COMMANDS.map((cmd) => (
            <code
              key={cmd}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {cmd}
            </code>
          ))}
        </div>
      </div>
    );
  }

  const mix = stats!.kci_status_mix;
  const totalKci = ORDER.reduce((sum, s) => sum + (mix[s] ?? 0), 0);
  const greenPct = totalKci ? Math.round(((mix.green ?? 0) / totalKci) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ── Hero: identity, then the four counts as one continuous band ──── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border bg-gradient-to-br from-brand-surface via-card to-brand-teal-surface px-6 py-6">
          <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand">
            Stage 0 · Foundation
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
            Compliance foundation
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The reference data every later stage reads from. Each control carries an owning
            department and a key indicator, so the matrix can say{" "}
            <em className="not-italic text-foreground">
              “covered by C-006, owned by Collections &amp; Recovery, currently amber.”
            </em>{" "}
            Live from <span className="font-medium text-foreground">{service}</span>.
          </p>
        </div>

        <dl className="grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
          <Stat icon={Building2} label="Functions" value={stats!.functions} hint="Departments" />
          <Stat icon={ShieldCheck} label="Controls" value={stats!.controls} hint="In the library" />
          <Stat icon={ListChecks} label="Indicators" value={stats!.kcis} hint="Measured monthly" />
          <Stat icon={FileText} label="Circulars" value={stats!.circulars} hint="Ingested" />
        </dl>
      </section>

      {/* ── Health beside the work it implies ────────────────────────────── */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Control health today
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Where the {stats!.kcis} indicators sit against their targets.
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-semibold leading-none tabular-nums text-status-good">
                {greenPct}%
              </div>
              <div className="mt-1 text-2xs uppercase tracking-wider text-muted-foreground">
                on target
              </div>
            </div>
          </div>

          <div className="mt-5 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {ORDER.filter((s) => (mix[s] ?? 0) > 0).map((s) => (
              <div
                key={s}
                className="transition-[width] duration-700 ease-out"
                style={{
                  width: `${((mix[s] ?? 0) / totalKci) * 100}%`,
                  backgroundColor: statusColor(s),
                }}
              />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(filter === s ? "all" : s)}
                aria-pressed={filter === s}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card",
                  filter === s
                    ? "border-brand-line/50 bg-brand-surface"
                    : "border-border hover:bg-muted",
                )}
              >
                <span className="flex items-center gap-1.5">
                  <StatusGlyph tone={statusTone(s)} square />
                  <span className="text-xs font-medium text-muted-foreground">
                    {statusLabel(s)}
                  </span>
                </span>
                <span className="mt-1 block text-xl font-semibold tabular-nums text-foreground">
                  {mix[s] ?? 0}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-2xs text-muted-foreground">
            Tap a band to filter the library below.
          </p>
        </section>

        <section className="flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm">
          <header className="flex items-center gap-2 border-b border-border px-5 py-3">
            <TriangleAlert aria-hidden className="size-4 text-status-warning" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Needs attention
            </h2>
            <span className="ml-auto text-xs tabular-nums text-muted-foreground">
              {attention.length} off target
            </span>
          </header>
          {attention.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Every indicator is on target.
            </p>
          ) : (
            <ul className="scroll-slim max-h-[19rem] divide-y divide-border overflow-y-auto">
              {attention.map(({ control, kci }) => (
                <li key={kci.id} className="flex items-center gap-3 px-5 py-2.5">
                  <StatusGlyph tone={statusTone(kci.status)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{kci.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{control.code}</span> · {control.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {kci.current_value}
                    <span className="mx-1 opacity-50">vs</span>
                    <span className="text-foreground">{kci.target}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── The library, as scannable cards rather than a wall of rows ───── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Control library{" "}
            <span className="text-sm font-normal tabular-nums text-muted-foreground">
              {filtered.length} of {controls.length}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
              {(["all", ...ORDER] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    filter === f
                      ? "bg-card text-brand shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="relative w-56">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter controls…"
                aria-label="Filter controls"
                className="h-9 pl-8 text-xs"
              />
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card">
            <EmptyState
              icon={Search}
              title="No controls match"
              description="Try a different search or clear the status filter."
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <ControlCard
                key={c.id}
                control={c}
                kci={c.kcis[0]}
                onOpen={() => setOpenControl(c.id)}
              />
            ))}
          </div>
        )}
      </section>

      <ControlDetailDialog
        control={controls.find((c) => c.id === openControl) ?? null}
        onClose={() => setOpenControl(null)}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="px-6 py-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className="size-3.5 text-brand" />
        {label}
      </dt>
      <dd className="mt-1.5 text-3xl font-semibold leading-none tracking-tight text-foreground">
        {value.toLocaleString()}
      </dd>
      <dd className="mt-1.5 text-2xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

/** One control, with its indicator's reading right on the face of the card — the
 *  fact that makes Stage 5's "covered by C-006, currently amber" trustworthy.
 *
 *  A button rather than an article: the card is the way into the full record, and the
 *  hover lift was already promising that. Only the first KCI fits here, so a control
 *  with three indicators reads the same as one with a single indicator until it is
 *  opened. */
function ControlCard({
  control,
  kci,
  onOpen,
}: {
  control: ControlOut;
  kci: KciOut | undefined;
  onOpen: () => void;
}) {
  const more = control.kcis.length - 1;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open the full record for ${control.code} ${control.name}`}
      className={cn(
        "group flex flex-col rounded-xl border bg-card p-4 text-left shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-brand-line/40 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        kci?.status === "red" ? "border-status-critical/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold text-muted-foreground">
          {control.code}
        </span>
        {kci ? (
          <StatusChip status={kci.status} />
        ) : (
          <span className="text-2xs text-muted-foreground">No KCI</span>
        )}
      </div>

      <h3 className="mt-2.5 text-sm font-semibold leading-snug text-foreground">
        {control.name}
      </h3>
      <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-muted-foreground">
        {control.description}
      </p>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3">
        {control.owner_function && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 aria-hidden className="size-3 shrink-0" />
            <span className="font-mono text-brand-teal">{control.owner_function.code}</span>
            <span className="truncate">{control.owner_function.name}</span>
          </p>
        )}
        {kci && (
          <p className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{kci.name}</span>
            <span className="shrink-0 font-mono tabular-nums text-foreground">
              {kci.current_value}
              <span className="mx-1 text-muted-foreground opacity-60">vs</span>
              {kci.target}
            </span>
          </p>
        )}
        {more > 0 && (
          <p className="text-2xs text-muted-foreground">
            +{more} more indicator{more === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </button>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[15.5rem] w-full rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
