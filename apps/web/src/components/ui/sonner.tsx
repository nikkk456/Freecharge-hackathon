import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/lib/theme";

/**
 * Toasts carry the reserved status palette, and — like every other status surface
 * in this app — never colour alone: each kind ships its own icon too.
 */
export function Toaster() {
  const { resolved } = useTheme();
  return (
    <Sonner
      theme={resolved}
      position="bottom-right"
      closeButton
      icons={{
        success: <Check className="size-4" style={{ color: "var(--status-good)" }} />,
        error: <CircleAlert className="size-4" style={{ color: "var(--status-critical)" }} />,
        warning: <TriangleAlert className="size-4" style={{ color: "var(--status-warning)" }} />,
        info: <Info className="size-4 text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
          actionButton: "rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground",
          cancelButton: "rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground",
          closeButton: "border-border bg-card text-muted-foreground hover:text-foreground",
        },
      }}
    />
  );
}
