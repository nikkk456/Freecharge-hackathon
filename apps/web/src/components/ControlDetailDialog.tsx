import { Building2, Gauge, ShieldCheck } from "lucide-react";
import StatusChip from "@/components/StatusChip";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ControlOut } from "@/lib/api";

const FREQUENCY_LABEL: Record<string, string> = {
  DAILY: "Measured daily",
  WEEKLY: "Measured weekly",
  MONTHLY: "Measured monthly",
  QUARTERLY: "Measured quarterly",
};

/**
 * One control, in full.
 *
 * The library card is a summary and has to stay one: it clamps the description to two
 * lines and shows only the *first* KCI. A control with three indicators looks identical
 * on the grid to one with a single indicator, and the two amber readings behind the
 * green one are invisible. This is where the rest of the record lives — every indicator
 * with its own reading, the owning department in words rather than a code, and the
 * description unclipped.
 */
export default function ControlDetailDialog({
  control,
  onClose,
}: {
  control: ControlOut | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={control != null} onOpenChange={(open) => !open && onClose()}>
      {control && (
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-2xs font-semibold text-muted-foreground">
                {control.code}
              </span>
              {control.kcis.length > 0 && <StatusChip status={control.kcis[0].status} />}
            </div>
            <DialogTitle className="mt-2">{control.name}</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-6">
            {control.description && (
              <section>
                <SectionLabel icon={ShieldCheck}>What the control does</SectionLabel>
                <DialogDescription className="mt-2">{control.description}</DialogDescription>
              </section>
            )}

            <section>
              <SectionLabel icon={Building2}>Owned by</SectionLabel>
              {control.owner_function ? (
                <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3.5 py-3">
                  <p className="text-sm font-medium text-foreground">
                    <span className="mr-2 font-mono text-xs text-brand-teal">
                      {control.owner_function.code}
                    </span>
                    {control.owner_function.name}
                  </p>
                  {control.owner_function.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {control.owner_function.description}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No owning department recorded — nobody is accountable for this control.
                </p>
              )}
            </section>

            <section>
              <SectionLabel icon={Gauge}>
                Key control indicators{" "}
                <span className="tabular-nums font-normal">({control.kcis.length})</span>
              </SectionLabel>
              {control.kcis.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  No indicator is attached, so this control's health is unmeasured.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {control.kcis.map((kci) => (
                    <li
                      key={kci.id}
                      className="rounded-lg border border-border bg-muted/40 px-3.5 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 text-sm font-medium text-foreground">{kci.name}</p>
                        <StatusChip status={kci.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-mono text-xs text-muted-foreground">{kci.code}</span>
                        <span className="font-mono text-sm tabular-nums text-foreground">
                          {kci.current_value ?? "—"}
                          <span className="mx-1.5 text-xs text-muted-foreground opacity-60">
                            vs
                          </span>
                          {kci.target ?? "—"}
                        </span>
                      </div>
                      <p className="mt-1 text-2xs text-muted-foreground">
                        {FREQUENCY_LABEL[kci.frequency] ?? kci.frequency}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </DialogBody>
        </DialogContent>
      )}
    </Dialog>
  );
}

function SectionLabel({
  icon: Icon,
  children,
}: {
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon aria-hidden className="size-3.5 text-brand" />
      {children}
    </h3>
  );
}
