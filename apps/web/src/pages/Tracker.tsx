import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  CircleDot,
  ListChecks,
  Loader2,
  Paperclip,
  PenLine,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Callout from "@/components/Callout";
import EmptyState from "@/components/EmptyState";
import ItemStatusChip, { OverdueChip, itemStatusLabel } from "@/components/ItemStatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  api,
  CAN_PUBLISH,
  type ItemStatus,
  type SweepResult,
  type TrackedItem,
  type TrackerStats,
  type User,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Filter = "all" | "mine" | "overdue" | "unassigned" | ItemStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "Mine" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "OPEN", label: "Open" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "SUBMITTED", label: "Submitted" },
  { key: "CLOSED", label: "Closed" },
];

export default function Tracker() {
  const { user, can } = useAuth();
  const [items, setItems] = useState<TrackedItem[]>([]);
  const [stats, setStats] = useState<TrackerStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [closing, setClosing] = useState<string | null>(null);

  const params = useMemo((): Record<string, string> => {
    if (filter === "all") return {};
    if (filter === "overdue") return { overdue: "true" };
    if (filter === "unassigned") return { unassigned: "true" };
    if (filter === "mine") return user ? { owner_id: user.id } : {};
    return { status: filter };
  }, [filter, user]);

  const load = useCallback(() => {
    Promise.all([api.trackedItems(params), api.trackerStats()])
      .then(([rows, counts]) => {
        setItems(rows);
        setStats(counts);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  useEffect(load, [load]);
  useEffect(() => {
    api.users().then(setUsers).catch(() => setUsers([]));
  }, []);

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (success) toast.success(success);
      load();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("That did not go through", { description: message });
    } finally {
      setBusy(false);
    }
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      [i.description, i.circular_ref ?? "", i.owner?.full_name ?? "", i.owner_function_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [items, query]);

  return (
    <div className="space-y-5">
      {/* ── Header band ──────────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5 bg-gradient-to-br from-brand-surface via-card to-brand-teal-surface px-6 py-5">
          <div className="min-w-[18rem] flex-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand">
              Stage 6 · Tracker
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
              Action tracker
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Every obligation extracted from a circular, with a named owner and a deadline.
              Closing needs evidence and a second pair of eyes — nothing here closes itself.
            </p>
          </div>
          {can(...CAN_PUBLISH) && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const result = await api.runSweep();
                  setSweep(result);
                })
              }
              title="The same check the scheduled job runs every morning at 08:00"
            >
              <CalendarClock />
              Run overdue check
            </Button>
          )}
        </div>

        {stats && (
          <dl className="grid grid-cols-2 divide-border border-t border-border sm:grid-cols-4 sm:divide-x">
            <Stat label="Open" value={stats.open} hint="Not started" Icon={CircleDot} />
            <Stat
              label="In progress"
              value={stats.in_progress}
              hint="Being worked on"
              Icon={ListChecks}
            />
            <Stat
              label="Overdue"
              value={stats.overdue}
              hint={stats.overdue > 0 ? "Past the deadline" : "Nothing late"}
              Icon={CalendarClock}
              alarming={stats.overdue > 0}
            />
            <Stat
              label="Closed"
              value={stats.closed}
              hint="Signed off with evidence"
              Icon={CircleCheck}
            />
          </dl>
        )}
      </section>

      {error && <Callout tone="critical">{error}</Callout>}
      {sweep && <Callout tone="warning">{sweep.detail}</Callout>}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              aria-pressed={filter === option.key}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                filter === option.key
                  ? "bg-card text-brand shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
              {option.key === "overdue" && stats && stats.overdue > 0 && (
                <span className="ml-1.5 tabular-nums text-status-critical">{stats.overdue}</span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search obligations…"
            aria-label="Search obligations"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      {/* ── Work items ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={ListChecks}
            title={filter === "all" && !query ? "No action items yet" : "Nothing matches"}
            description={
              filter === "all" && !query
                ? "Analyse a circular and every obligation it creates lands here with an owner and a deadline."
                : "Try a different filter or search."
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {shown.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              users={users}
              busy={busy}
              canClose={can(...CAN_PUBLISH)}
              closing={closing === item.id}
              onToggleClose={() => setClosing(closing === item.id ? null : item.id)}
              onDismissClose={() => setClosing(null)}
              onRun={run}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  Icon,
  alarming,
}: {
  label: string;
  value: number;
  hint: string;
  Icon: typeof CircleDot;
  alarming?: boolean;
}) {
  return (
    <div className={cn("px-6 py-3.5", alarming && "bg-status-critical-surface")}>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon
          aria-hidden
          className={cn("size-3.5", alarming ? "text-status-critical" : "text-brand")}
        />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-2xl font-semibold leading-none tabular-nums tracking-tight",
          alarming ? "text-status-critical" : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </dd>
      <dd className="mt-1 text-2xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

/** One obligation. Reads as a work item — what must be done, who owns it, when it is
 *  due, and exactly which moves the API will accept next. */
function ItemRow({
  item,
  users,
  busy,
  canClose,
  closing,
  onToggleClose,
  onDismissClose,
  onRun,
}: {
  item: TrackedItem;
  users: User[];
  busy: boolean;
  canClose: boolean;
  closing: boolean;
  onToggleClose: () => void;
  onDismissClose: () => void;
  onRun: (action: () => Promise<unknown>, success?: string) => Promise<void>;
}) {
  const closed = item.status === "CLOSED";
  const canCloseNow = item.allowed_transitions.includes("CLOSED");
  // Belt and braces: if the item moves somewhere CLOSED is no longer reachable
  // from, drop the form even before the refetch lands.
  const showCloseForm = closing && canCloseNow && !closed;
  return (
    <li
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm transition-colors",
        item.is_overdue
          ? "border-status-critical/30"
          : "border-border hover:border-brand-line/30",
        closed && "opacity-75",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-[16rem] flex-1">
          <p
            className={cn(
              "text-sm leading-snug",
              closed ? "text-muted-foreground" : "font-medium text-foreground",
            )}
          >
            {item.description}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xs text-muted-foreground">
            <Link
              to={`/circulars/${item.circular_id}`}
              className="rounded-sm font-mono text-brand underline decoration-brand-line/40 underline-offset-2 transition-colors hover:decoration-brand"
            >
              {item.circular_ref ?? item.circular_title ?? "circular"}
            </Link>
            {item.owner_function_code && (
              <span className="flex items-center gap-1">
                <span className="font-mono text-brand-teal">{item.owner_function_code}</span>
                {item.owner_function_name}
              </span>
            )}
            {item.source === "HUMAN" && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                added by a reviewer
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ItemStatusChip status={item.status} />
          {item.is_overdue && <OverdueChip days={item.days_until_due} />}
        </div>
      </div>

      {closed ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-xs text-muted-foreground">
          <CircleCheck aria-hidden className="size-3.5 text-status-good" />
          Signed off by{" "}
          <span className="font-medium text-foreground">{item.closed_by_name}</span>
          {item.evidence_url && (
            <>
              ·
              <a
                href={item.evidence_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-sm text-brand underline underline-offset-2"
              >
                <Paperclip aria-hidden className="size-3" />
                evidence
              </a>
            </>
          )}
          {item.closure_note && <span>· {item.closure_note}</span>}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3 border-t border-border pt-3">
          <label className="flex items-center gap-1.5">
            <UserRound aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="sr-only">Owner</span>
            <Select
              size="sm"
              aria-label={`Owner for: ${item.description.slice(0, 40)}`}
              value={item.owner?.id ?? ""}
              disabled={busy}
              onValueChange={(ownerId) =>
                void onRun(
                  () => api.assignItem(item.id, { owner_id: ownerId || null }),
                  "Owner updated",
                )
              }
              className="w-40"
            >
              <SelectItem value="">Unassigned</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </Select>
          </label>

          <label className="flex items-center gap-1.5">
            <CalendarClock aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="sr-only">Due date</span>
            <Input
              type="date"
              aria-label={`Due date for: ${item.description.slice(0, 40)}`}
              value={item.due_date ?? ""}
              disabled={busy}
              onChange={(e) =>
                void onRun(
                  () => api.assignItem(item.id, { due_date: e.target.value || null }),
                  "Due date updated",
                )
              }
              className="h-7 w-[8.75rem] px-2 text-xs tabular-nums"
            />
          </label>

          {/* Exactly the moves the API will accept — the same table it enforces,
              so the UI can never offer an illegal one. */}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />
            {item.allowed_transitions
              .filter((next) => next !== "CLOSED")
              .map((next) => (
                <Button
                  key={next}
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onDismissClose();
                    void onRun(
                      () => api.moveItem(item.id, next),
                      `Moved to ${itemStatusLabel(next).toLowerCase()}`,
                    );
                  }}
                >
                  {itemStatusLabel(next)}
                </Button>
              ))}
            {canCloseNow &&
              (canClose ? (
                <Button size="xs" disabled={busy} onClick={onToggleClose}>
                  {closing ? "Cancel" : "Close…"}
                </Button>
              ) : (
                <span className="text-2xs text-muted-foreground">awaiting sign-off</span>
              ))}
          </div>
        </div>
      )}

      {showCloseForm && (
        <CloseForm
          busy={busy}
          onCancel={onToggleClose}
          onSubmit={(evidence) =>
            void onRun(async () => {
              await api.closeItem(item.id, evidence);
              onToggleClose();
            }, "Item closed with evidence")
          }
        />
      )}
    </li>
  );
}

function CloseForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (evidence: { evidence_url?: string; closure_note?: string }) => void;
}) {
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  // Mirrors the API's rule so the button cannot be pressed into a 422.
  const hasEvidence = url.trim().length > 0 || note.trim().length > 0;

  return (
    <div className="mt-3 animate-fade-up overflow-hidden rounded-lg border border-brand-line/50 bg-brand-surface">
      <div className="flex items-center gap-2 border-b border-brand-line/40 px-3.5 py-2">
        <ShieldCheck aria-hidden className="size-3.5 shrink-0 text-brand" />
        <p className="text-xs font-semibold text-brand">Record the closure</p>
        <p className="ml-auto text-2xs text-muted-foreground">
          A link, a note, or both — at least one is required.
        </p>
      </div>

      <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-2">
        <label className="block">
          <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            <Paperclip aria-hidden className="size-3" />
            Evidence link
          </span>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…  ticket, policy, or signed memo"
            aria-label="Evidence link"
            className="mt-1.5 h-8 bg-card text-xs"
          />
        </label>
        <label className="block">
          <span className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            <PenLine aria-hidden className="size-3" />
            What was done
          </span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Board briefed on 14 Aug; policy v3 published"
            aria-label="Closure note"
            className="mt-1.5 h-8 bg-card text-xs"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-brand-line/40 px-3.5 py-2.5">
        <Button
          size="sm"
          disabled={busy || !hasEvidence}
          onClick={() =>
            onSubmit({
              evidence_url: url.trim() || undefined,
              closure_note: note.trim() || undefined,
            })
          }
        >
          {busy ? <Loader2 className="animate-spin" /> : <CircleCheck />}
          Close item
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {!hasEvidence && (
          <p className="ml-auto text-2xs text-muted-foreground">
            Nothing closes without something to point at afterwards.
          </p>
        )}
      </div>
    </div>
  );
}
