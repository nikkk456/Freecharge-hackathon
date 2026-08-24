import {
  ArrowUpRight,
  CalendarDays,
  FileStack,
  FileText,
  Layers,
  Loader2,
  RotateCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Callout from "@/components/Callout";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type CircularStatusName, type CircularSummary, type OcrStatus } from "@/lib/api";
import { usePolling } from "@/lib/usePolling";
import { cn } from "@/lib/utils";

type Filter = "all" | "published" | "analyzed" | "pending" | "failed";

const FILTERS: { key: Filter; label: string; match: (s: CircularStatusName) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "published", label: "Published", match: (s) => s === "PUBLISHED" },
  { key: "analyzed", label: "Analysed", match: (s) => s === "ANALYZED" },
  {
    key: "pending",
    label: "Awaiting AI",
    match: (s) => s === "PARSED" || s === "PARSING" || s === "UPLOADED" || s === "ANALYZING",
  },
  { key: "failed", label: "Failed", match: (s) => s === "FAILED" },
];

export default function Circulars() {
  const [rows, setRows] = useState<CircularSummary[]>([]);
  const [ocr, setOcr] = useState<OcrStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  // Which circular the delete confirmation is open for. A native window.confirm()
  // used to sit here — an OS dialog that breaks out of the app mid-demo.
  const [pendingDelete, setPendingDelete] = useState<CircularSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setRows(await api.circulars());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    api.ocrStatus().then(setOcr).catch(() => setOcr(null));
  }, [refresh]);

  // A scanned upload is OCR'd in the worker, so the row finishes after the
  // response. Keep asking until nothing is mid-flight.
  const working = rows.some((r) => r.status === "PARSING" || r.status === "UPLOADED");
  usePolling(() => void refresh(), working);

  const counts = useMemo(() => {
    const by = (f: Filter) => rows.filter((r) => FILTERS.find((x) => x.key === f)!.match(r.status));
    return {
      published: by("published").length,
      analyzed: by("analyzed").length,
      pending: by("pending").length,
      failed: by("failed").length,
      pages: rows.reduce((sum, r) => sum + (r.page_count ?? 0), 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = FILTERS.find((f) => f.key === filter)!.match;
    return rows.filter((r) => {
      if (!match(r.status)) return false;
      if (!q) return true;
      return [r.ref_no ?? "", r.title ?? "", r.source].join(" ").toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      // Sequential, not Promise.all: a shared upload limit and clearer failures.
      for (const file of Array.from(files)) {
        await api.uploadCircular(file);
      }
      const count = files.length;
      toast.success(count === 1 ? "Circular uploaded" : `${count} circulars uploaded`, {
        description: "Extracting text — the list updates itself.",
      });
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Upload failed", { description: message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function retry(id: string) {
    setRetrying(id);
    setError("");
    try {
      await api.retryCircular(id);
      toast.success("Retrying text extraction");
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Retry failed", { description: message });
    } finally {
      setRetrying(null);
    }
  }

  async function remove(target: CircularSummary) {
    const label = target.title || "this circular";
    try {
      await api.deleteCircular(target.id);
      toast.success("Circular deleted", { description: `"${label}" and its stored PDF.` });
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      setError(message);
      toast.error("Could not delete", { description: message });
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div
      className="space-y-5"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // Only clear when the pointer actually leaves the page, not on every child.
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
    >
      {/* ── Header band: identity, the counts, and the upload affordance ─── */}
      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5 bg-gradient-to-br from-brand-surface via-card to-brand-teal-surface px-6 py-5">
          <div className="min-w-[18rem] flex-1">
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-brand">
              Stage 1 · Ingestion
            </p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
              Circulars
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Any regulatory PDF — typed, scanned, or a mix. Text is extracted and stored with
              per-page character offsets, which is what makes citing an exact source line
              possible later.
            </p>
          </div>

          {/* The whole page is the drop target, so this stays a compact control
              rather than the large dashed box that used to dominate the screen. */}
          <div
            className={cn(
              "flex w-[17rem] shrink-0 flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-colors",
              dragging
                ? "border-brand bg-brand-surface-strong"
                : "border-border bg-card/70 hover:border-brand-line/50",
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-brand-surface ring-1 ring-inset ring-brand-line/25">
              <Upload aria-hidden className="size-4 text-brand" />
            </span>
            <p className="text-xs text-muted-foreground">
              {dragging ? "Drop to upload" : "Drop a PDF anywhere, or"}
            </p>
            <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy && <Loader2 className="animate-spin" />}
              {busy ? "Uploading…" : "Choose a PDF"}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              hidden
              onChange={(e) => void upload(e.target.files)}
            />
            <p className="text-2xs text-muted-foreground/80">
              Up to 25 MB · OCR
              {ocr?.ready && ocr.available_engines.length > 0 && ` (${ocr.available_engines[0]})`}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 divide-border border-t border-border sm:grid-cols-4 sm:divide-x">
          <Stat icon={FileStack} label="In the library" value={rows.length} />
          <Stat icon={Layers} label="Pages extracted" value={counts.pages} />
          <Stat icon={FileText} label="Published" value={counts.published} />
          <Stat
            icon={RotateCw}
            label="Awaiting AI"
            value={counts.pending}
            busy={working}
          />
        </dl>
      </section>

      {ocr && !ocr.ready && (
        <Callout tone="warning" title="Scanned PDFs cannot be read.">
          {ocr.detail}
        </Callout>
      )}
      {error && <Callout tone="critical">{error}</Callout>}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5">
          {FILTERS.map((f) => {
            const n =
              f.key === "all"
                ? rows.length
                : counts[f.key as Exclude<Filter, "all">] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                  filter === f.key
                    ? "bg-card text-brand shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>

        <div className="relative w-64">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reference or title…"
            aria-label="Search circulars"
            className="h-9 pl-8 text-xs"
          />
        </div>
      </div>

      {/* ── The library ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState
            icon={FileText}
            title={rows.length === 0 ? "Nothing uploaded yet" : "Nothing matches"}
            description={
              rows.length === 0
                ? "Drop a circular anywhere on this page and its text will be extracted, stored, and made citable."
                : "Try a different search, or clear the status filter."
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CircularCard
              key={c.id}
              circular={c}
              retrying={retrying === c.id}
              onRetry={() => void retry(c.id)}
              onDelete={() => setPendingDelete(c)}
            />
          ))}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this circular?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {pendingDelete?.title || "This circular"}
              </span>{" "}
              and its stored PDF will be removed. Any analysis, matrix and action items derived
              from it go with it. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDelete && void remove(pendingDelete)}
            >
              Delete
            </AlertDialogAction>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  busy,
}: {
  icon: typeof FileStack;
  label: string;
  value: number;
  busy?: boolean;
}) {
  return (
    <div className="px-6 py-3.5">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon aria-hidden className={cn("size-3.5 text-brand", busy && "animate-spin")} />
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}

/** One circular. The whole card is the link — a 186-item library is scanned, not
 *  read, so the target needs to be the card rather than a few words of title. */
function CircularCard({
  circular: c,
  retrying,
  onRetry,
  onDelete,
}: {
  circular: CircularSummary;
  retrying: boolean;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const failed = c.status === "FAILED";
  return (
    <article
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card p-4 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:border-brand-line/40 hover:shadow-md",
        "focus-within:border-brand-line/50 focus-within:shadow-md",
        failed ? "border-status-critical/30" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "rounded-md px-1.5 py-0.5 font-mono text-2xs font-semibold",
            c.ref_no
              ? "bg-brand-surface text-brand ring-1 ring-inset ring-brand-line/25"
              : "bg-muted text-muted-foreground",
          )}
        >
          {c.ref_no ?? c.source}
        </span>
        <StatusBadge status={c.status} />
      </div>

      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-foreground">
        {/* Stretched link: the anchor covers the card, but the buttons below sit
            above it in the stacking order so they stay independently clickable. */}
        <Link to={`/circulars/${c.id}`} className="after:absolute after:inset-0 after:rounded-xl">
          {c.title || "Untitled"}
        </Link>
      </h3>

      {c.parse_error && (
        <p className="mt-1.5 line-clamp-2 text-xs text-status-critical">{c.parse_error}</p>
      )}
      {c.status === "PARSING" && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Reading scanned pages — a few seconds per page.
        </p>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3.5">
        <dl className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-2xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <CalendarDays aria-hidden className="size-3" />
            <dd className="tabular-nums">{c.issued_date ?? "no date"}</dd>
          </div>
          <div className="flex items-center gap-1">
            <Layers aria-hidden className="size-3" />
            <dd className="tabular-nums">
              {c.page_count ?? "—"} page{c.page_count === 1 ? "" : "s"}
            </dd>
          </div>
        </dl>

        <div className="relative z-10 flex items-center gap-0.5">
          {failed && (
            <Button size="xs" variant="outline" disabled={retrying} onClick={onRetry}>
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCw />}
              {retrying ? "Retrying…" : "Retry"}
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Delete ${c.title || "this circular"}`}
            title="Delete"
            onClick={onDelete}
            className="hover:text-status-critical"
          >
            <Trash2 />
          </Button>
          <ArrowUpRight
            aria-hidden
            className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      </div>
    </article>
  );
}
