import { Check, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import Callout from "@/components/Callout";
import CitationChip from "@/components/CitationChip";
import ConfidenceMeter from "@/components/ConfidenceMeter";
import { EditableText, RiskSelector } from "@/components/ReviewControls";
import RiskBadge from "@/components/RiskBadge";
import VerificationBadge from "@/components/VerificationBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import {
  api,
  CAN_PUBLISH,
  type Analysis,
  type Citation,
  type FunctionOut,
  type PriorityName,
  type RiskRating,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<PriorityName, string> = {
  HIGH: "font-semibold text-foreground",
  MEDIUM: "text-foreground/90",
  LOW: "text-muted-foreground",
};

function sameCitation(a: Citation | null, b: Citation | null): boolean {
  return !!a && !!b && a.target_kind === b.target_kind && a.target_ref === b.target_ref;
}

/** A small "added by reviewer" marker. Human authorship survives an AI re-run, so it
 *  is worth showing which rows a person put there. */
function HumanTag() {
  return (
    <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
      added by reviewer
    </span>
  );
}

export default function AnalysisPanel({
  analysis,
  functions,
  activeCitation,
  onSelectCitation,
  onChanged,
}: {
  analysis: Analysis;
  functions: FunctionOut[];
  activeCitation: Citation | null;
  onSelectCitation: (citation: Citation) => void;
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ description: "", owner: "", priority: "MEDIUM" });

  const editable = analysis.editable;

  // Every mutation funnels through here so one failure path serves them all, and the
  // parent always refetches — the server is the source of truth, not local state.
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

  const unlisted = functions.filter(
    (f) => !analysis.impacted_functions.some((i) => i.code === f.code),
  );

  return (
    <div className="space-y-4">
      {error && <Callout tone="critical">{error}</Callout>}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <CardTitle>AI analysis</CardTitle>
            <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              v{analysis.version} · {analysis.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted-foreground">confidence</span>
            <ConfidenceMeter value={analysis.confidence} width={56} />
            {analysis.risk_rating && <RiskBadge rating={analysis.risk_rating} />}
            {analysis.risk_rating && (
              <RiskSelector
                value={analysis.risk_rating}
                disabled={!editable || busy}
                onChange={(rating: RiskRating) =>
                  void run(() => api.editAnalysis(analysis.id, { risk_rating: rating }))
                }
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <VerificationBadge
            verified={analysis.citations_verified}
            total={analysis.citations_total}
          />

          {analysis.needs_review && (
            <Callout tone="warning">
              Confidence is below the auto-accept threshold — this draft needs a closer read.
            </Callout>
          )}

          <div>
            <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Summary
            </h3>
            <EditableText
              label="Summary"
              value={analysis.summary ?? ""}
              disabled={!editable}
              onSave={(next) => run(() => api.editAnalysis(analysis.id, { summary: next }))}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Why this rating
              </h3>
              <CitationChip
                citation={analysis.risk_citation}
                active={sameCitation(activeCitation, analysis.risk_citation)}
                onSelect={onSelectCitation}
              />
            </div>
            <EditableText
              label="Risk reasoning"
              rows={3}
              value={analysis.risk_reasoning ?? ""}
              disabled={!editable}
              onSave={(next) => run(() => api.editAnalysis(analysis.id, { risk_reasoning: next }))}
            />
          </div>

          <p className="text-xs text-muted-foreground/80">
            Drafted by {analysis.model_name}
            {analysis.edited_by_name && ` · edited by ${analysis.edited_by_name}`}
            {analysis.reviewed_by_name
              ? ` · approved by ${analysis.reviewed_by_name}`
              : " · not published until a human approves it"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Impacted departments{" "}
            <span className="font-normal tabular-nums text-muted-foreground">
              ({analysis.impacted_functions.length})
            </span>
          </CardTitle>
          {editable && unlisted.length > 0 && (
            <Select
              size="sm"
              aria-label="Add an impacted department"
              value=""
              placeholder="Add a department…"
              disabled={busy}
              onValueChange={(code) => code && void run(() => api.addFunction(analysis.id, code))}
              className="w-56"
            >
              {unlisted.map((f) => (
                <SelectItem key={f.code} value={f.code} code={f.code}>
                  {f.name}
                </SelectItem>
              ))}
            </Select>
          )}
        </CardHeader>
        <ul className="divide-y divide-border">
          {analysis.impacted_functions.map((f) => (
            <li key={f.code} className="px-5 py-3 transition-colors hover:bg-muted/40">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  <span className="mr-2 tabular-nums text-muted-foreground">{f.code}</span>
                  {f.name}
                  {f.source === "HUMAN" && <HumanTag />}
                </span>
                <span className="flex items-center gap-3">
                  <ConfidenceMeter value={f.confidence} />
                  <CitationChip
                    citation={f.citation}
                    active={sameCitation(activeCitation, f.citation)}
                    onSelect={onSelectCitation}
                  />
                  {editable && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`Remove ${f.name}`}
                      title="Remove"
                      onClick={() => void run(() => api.removeFunction(analysis.id, f.code))}
                      className="hover:text-status-critical"
                    >
                      <X />
                    </Button>
                  )}
                </span>
              </div>
              {f.reasoning && (
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{f.reasoning}</p>
              )}
            </li>
          ))}
          {analysis.impacted_functions.length === 0 && (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              No department was identified as impacted.
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Action items{" "}
            <span className="font-normal tabular-nums text-muted-foreground">
              ({analysis.action_items.length})
            </span>
          </CardTitle>
          {editable && (
            <Button size="xs" variant="outline" onClick={() => setAdding((v) => !v)}>
              {adding ? <X /> : <Plus />}
              {adding ? "Cancel" : "Add an item"}
            </Button>
          )}
        </CardHeader>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 border-b border-border bg-muted/40 px-5 py-3">
            <label className="min-w-[16rem] flex-1">
              <span className="text-xs font-medium text-muted-foreground">
                What must be done
              </span>
              <Input
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Brief the board on the January 2027 deadline"
                className="mt-1 h-8"
              />
            </label>
            <label>
              <span className="text-xs font-medium text-muted-foreground">Owner</span>
              <Select
                size="sm"
                value={newItem.owner}
                onValueChange={(owner) => setNewItem({ ...newItem, owner })}
                className="mt-1 w-56"
              >
                <SelectItem value="">Unassigned</SelectItem>
                {functions.map((f) => (
                  <SelectItem key={f.code} value={f.code} code={f.code}>
                    {f.name}
                  </SelectItem>
                ))}
              </Select>
            </label>
            <Button
              size="sm"
              disabled={busy || newItem.description.trim().length < 3}
              onClick={() =>
                void run(async () => {
                  await api.addActionItem(analysis.circular_id, {
                    description: newItem.description.trim(),
                    priority: newItem.priority as PriorityName,
                    owner_function_code: newItem.owner || null,
                    due_date: null,
                  });
                  setNewItem({ description: "", owner: "", priority: "MEDIUM" });
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
                <th className="min-w-[26rem] px-5 py-2 font-semibold">What must be done</th>
                <th className="px-5 py-2 font-semibold">Source</th>
                <th className="px-5 py-2 font-semibold">Owner</th>
                <th className="px-5 py-2 font-semibold">Priority</th>
                <th className="px-5 py-2 font-semibold">Due</th>
                {editable && (
                  <th className="px-5 py-2 font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {analysis.action_items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-muted/40"
                >
                  <td className={cn("w-[32rem] min-w-[26rem] px-5 py-3", PRIORITY_STYLE[item.priority])}>
                    {item.description}
                    {item.source === "HUMAN" && <HumanTag />}
                  </td>
                  <td className="px-5 py-3">
                    <CitationChip
                      citation={item.citation}
                      active={sameCitation(activeCitation, item.citation)}
                      onSelect={onSelectCitation}
                    />
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-foreground/90">
                    {editable ? (
                      <Select
                        size="sm"
                        aria-label={`Owner for: ${item.description.slice(0, 40)}`}
                        value={item.owner_function_code ?? ""}
                        disabled={busy}
                        onValueChange={(code) =>
                          void run(() =>
                            api.editActionItem(item.id, { owner_function_code: code || null }),
                          )
                        }
                        className="w-56"
                      >
                        <SelectItem value="">— Unassigned</SelectItem>
                        {functions.map((f) => (
                          <SelectItem key={f.code} value={f.code} code={f.code}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : item.owner_function_code ? (
                      <>
                        <span className="tabular-nums text-muted-foreground">
                          {item.owner_function_code}
                        </span>{" "}
                        {item.owner_function_name}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-foreground/90">
                    {editable ? (
                      <Select
                        size="sm"
                        aria-label={`Priority for: ${item.description.slice(0, 40)}`}
                        value={item.priority}
                        disabled={busy}
                        onValueChange={(priority) =>
                          void run(() =>
                            api.editActionItem(item.id, { priority: priority as PriorityName }),
                          )
                        }
                        className="w-28"
                      >
                        {(["LOW", "MEDIUM", "HIGH"] as PriorityName[]).map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </Select>
                    ) : (
                      item.priority
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-foreground/90">
                    {item.due_date ?? "—"}
                  </td>
                  {editable && (
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label="Remove this action item"
                        title="Remove"
                        onClick={() => void run(() => api.deleteActionItem(item.id))}
                        className="hover:text-status-critical"
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {analysis.action_items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-4 text-sm text-muted-foreground">
                    No action items were extracted.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <ApproveBar analysis={analysis} busy={busy} canPublish={can(...CAN_PUBLISH)} onRun={run} />
    </div>
  );
}

function ApproveBar({
  analysis,
  busy,
  canPublish,
  onRun,
}: {
  analysis: Analysis;
  busy: boolean;
  canPublish: boolean;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
}) {
  if (analysis.status === "PUBLISHED") {
    return (
      <Callout
        tone="good"
        title={
          <>
            Approved by{" "}
            <span className="font-semibold">{analysis.reviewed_by_name}</span>
            {analysis.published_at && ` on ${new Date(analysis.published_at).toLocaleString()}`}.
          </>
        }
      >
        Published analyses are frozen. Re-run the AI to produce a new draft.
      </Callout>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-lg text-sm text-muted-foreground">
          {canPublish
            ? "Everything above is a draft. Approving records this version against your name."
            : "You can edit this draft, but approving it requires a reviewer or owner."}
        </p>
        <Button
          disabled={busy || !canPublish}
          title={canPublish ? undefined : "Sign in as a reviewer or owner to approve"}
          onClick={() => void onRun(() => api.publish(analysis.id))}
        >
          <Check />
          Approve &amp; publish
        </Button>
      </CardContent>
    </Card>
  );
}
