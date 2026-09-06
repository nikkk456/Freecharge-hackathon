import { Check, Grid2x2, Loader2, Plus, RotateCw, Trash2, X } from "lucide-react";
import { useState } from "react";
import Callout from "@/components/Callout";
import CitationChip from "@/components/CitationChip";
import CoverageChip, { CoverageBar } from "@/components/CoverageChip";
import StatusChip from "@/components/StatusChip";
import VerificationBadge from "@/components/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import {
  api,
  CAN_PUBLISH,
  type Citation,
  type ControlOut,
  type CoverageName,
  type Rcm,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const COVERAGES: CoverageName[] = ["COVERED", "PARTIAL", "GAP"];

export default function RcmPanel({
  circularId,
  rcm,
  controls,
  building,
  canBuild,
  activeCitation,
  onSelectCitation,
  onBuild,
  onChanged,
}: {
  circularId: string;
  rcm: Rcm | null;
  controls: ControlOut[];
  building: boolean;
  canBuild: boolean;
  activeCitation: Citation | null;
  onSelectCitation: (citation: Citation) => void;
  onBuild: () => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ risk: "", control: "", code: "" });

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!rcm) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full border border-border bg-muted/60">
            <Grid2x2 aria-hidden className="size-[18px] text-muted-foreground" />
          </span>
          <h2 className="mt-3.5 text-sm font-semibold text-foreground">
            No Risk &amp; Control Matrix yet
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            Match each risk this circular creates against the existing control library, and
            surface the ones nothing covers.
          </p>
          <Button
            disabled={building || !canBuild}
            onClick={onBuild}
            title={canBuild ? undefined : "Analyse this circular first"}
            className="mt-4"
          >
            {building && <Loader2 className="animate-spin" />}
            {building ? "Building…" : "Build the matrix"}
          </Button>
          {error && (
            <p className="mt-3 text-sm text-status-critical">{error}</p>
          )}
        </CardContent>
      </Card>
    );
  }

  const editable = rcm.editable;

  return (
    <div className="space-y-4">
      {error && <Callout tone="critical">{error}</Callout>}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <CardTitle>Risk &amp; Control Matrix</CardTitle>
            <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {rcm.status}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={building || busy || !editable}
            onClick={onBuild}
            title={editable ? undefined : "Published matrices are frozen"}
          >
            {building ? <Loader2 className="animate-spin" /> : <RotateCw />}
            {building ? "Rebuilding…" : "Rebuild"}
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <CoverageBar covered={rcm.covered} partial={rcm.partial} gaps={rcm.gaps} />

          {rcm.gaps > 0 && (
            <Callout tone="critical">
              <span className="font-semibold tabular-nums text-foreground">{rcm.gaps}</span> of{" "}
              {rcm.rows.length} risks have{" "}
              <strong className="font-semibold text-foreground">no existing control</strong>{" "}
              behind them. Those are the ones that create work.
            </Callout>
          )}

          <VerificationBadge
            verified={rcm.citations_verified}
            total={rcm.citations_total}
            noun="risks"
          />

          <p className="text-xs text-muted-foreground/80">
            Matched against all {controls.length} controls in the library by {rcm.model_name}
            {rcm.reviewed_by_name && ` · approved by ${rcm.reviewed_by_name}`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Risks{" "}
            <span className="font-normal tabular-nums text-muted-foreground">
              ({rcm.rows.length})
            </span>
          </CardTitle>
          {editable && (
            <Button size="xs" variant="outline" onClick={() => setAdding((v) => !v)}>
              {adding ? <X /> : <Plus />}
              {adding ? "Cancel" : "Add a risk"}
            </Button>
          )}
        </CardHeader>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/40 px-5 py-3">
            <label className="min-w-[16rem] flex-1">
              <span className="text-xs font-medium text-muted-foreground">Risk</span>
              <Input
                value={draft.risk}
                onChange={(e) => setDraft({ ...draft, risk: e.target.value })}
                placeholder="What could go wrong"
                className="mt-1 h-8"
              />
            </label>
            <label className="min-w-[14rem] flex-1">
              <span className="text-xs font-medium text-muted-foreground">Control</span>
              <Input
                value={draft.control}
                onChange={(e) => setDraft({ ...draft, control: e.target.value })}
                placeholder="What the company does about it"
                className="mt-1 h-8"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">Existing control</span>
              <Select
                size="sm"
                value={draft.code}
                onValueChange={(code) => setDraft({ ...draft, code })}
                className="mt-1 w-64"
              >
                <SelectItem value="">None — this is a gap</SelectItem>
                {controls.map((c) => (
                  <SelectItem key={c.code} value={c.code} code={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              disabled={busy || draft.risk.trim().length < 3}
              onClick={() =>
                void run(async () => {
                  await api.addRcmRow(circularId, {
                    risk_text: draft.risk.trim(),
                    control_text: draft.control.trim(),
                    coverage: draft.code ? "PARTIAL" : "GAP",
                    mapped_control_code: draft.code || null,
                  });
                  setDraft({ risk: "", control: "", code: "" });
                  setAdding(false);
                })
              }
            >
              <Check />
              Add
            </Button>
          </div>
        )}

        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[58rem] text-left text-sm">
            <thead className="text-2xs uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border">
                <th className="min-w-[22rem] px-5 py-2 font-semibold">Risk</th>
                <th className="px-5 py-2 font-semibold">Source</th>
                <th className="px-5 py-2 font-semibold">Coverage</th>
                <th className="px-5 py-2 font-semibold">Existing control</th>
                {editable && (
                  <th className="px-5 py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rcm.rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className="w-[26rem] min-w-[22rem] px-5 py-3 align-top">
                    <div className="text-foreground">{row.risk_text}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.control_text}</div>
                    {row.reasoning && (
                      <div className="mt-1 max-w-xl text-xs text-muted-foreground/80">
                        {row.reasoning}
                      </div>
                    )}
                    {row.source === "HUMAN" && (
                      <span className="mt-1.5 inline-block rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                        added by reviewer
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <CitationChip
                      citation={row.citation}
                      active={
                        !!activeCitation &&
                        activeCitation.target_kind === "rcm_row" &&
                        activeCitation.target_ref === row.id
                      }
                      onSelect={onSelectCitation}
                    />
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <Select
                        size="sm"
                        aria-label={`Coverage for: ${row.risk_text.slice(0, 40)}`}
                        value={row.coverage}
                        disabled={busy}
                        onValueChange={(coverage) =>
                          void run(() =>
                            api.editRcmRow(row.id, { coverage: coverage as CoverageName }),
                          )
                        }
                        className="w-32"
                      >
                        {COVERAGES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : (
                      <CoverageChip coverage={row.coverage} />
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {editable ? (
                      <Select
                        size="sm"
                        aria-label={`Control for: ${row.risk_text.slice(0, 40)}`}
                        value={row.control?.code ?? ""}
                        disabled={busy}
                        onValueChange={(code) =>
                          void run(() =>
                            api.editRcmRow(row.id, { mapped_control_code: code || null }),
                          )
                        }
                        className="w-64"
                      >
                        <SelectItem value="">None — gap</SelectItem>
                        {controls.map((c) => (
                          <SelectItem key={c.code} value={c.code} code={c.code}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : row.control ? (
                      <div>
                        <div className="whitespace-nowrap text-foreground">
                          <span className="mr-1.5 tabular-nums text-muted-foreground">
                            {row.control.code}
                          </span>
                          {row.control.name}
                        </div>
                        {row.control.owner_function_code && (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {row.control.owner_function_code} {row.control.owner_function_name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                    {row.control?.kci_status && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusChip status={row.control.kci_status} />
                        <span className="text-xs text-muted-foreground">
                          {row.control.kci_name}
                          {row.control.kci_current_value &&
                            ` · ${row.control.kci_current_value} vs ${row.control.kci_target}`}
                        </span>
                      </div>
                    )}
                  </td>
                  {editable && (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label="Remove this risk"
                        title="Remove"
                        onClick={() => void run(() => api.deleteRcmRow(row.id))}
                        className="hover:text-status-critical"
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {rcm.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-4 text-sm text-muted-foreground">
                    No risks in this matrix yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {rcm.status === "PUBLISHED" ? (
        <Callout
          tone="good"
          title={
            <>
              Matrix approved by{" "}
              <span className="font-semibold">{rcm.reviewed_by_name}</span>
              {rcm.published_at && ` on ${new Date(rcm.published_at).toLocaleString()}`}.
            </>
          }
        >
          Published matrices are frozen. Rebuild to produce a new draft.
        </Callout>
      ) : (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-lg text-sm text-muted-foreground">
              {can(...CAN_PUBLISH)
                ? "Approving records this matrix against your name."
                : "Approving the matrix requires a reviewer or owner."}
            </p>
            <Button
              disabled={busy || !can(...CAN_PUBLISH) || rcm.rows.length === 0}
              onClick={() => void run(() => api.publishRcm(rcm.id))}
            >
              <Check />
              Approve &amp; publish matrix
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
