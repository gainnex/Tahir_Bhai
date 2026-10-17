import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { BudgetUsage } from "@/lib/budget";
import { cn } from "@/lib/utils";

// Budget bar (docs/SCREENS.md): green < 80 %, amber 80–100 %, red > 100 %.
// Status colour is always paired with an icon + text, never colour alone.
const LEVEL = {
  ok: { track: "bg-emerald-100", bar: "bg-emerald-600", text: "text-emerald-700", Icon: CheckCircle2, label: "Within budget" },
  warning: { track: "bg-amber-100", bar: "bg-amber-500", text: "text-amber-700", Icon: AlertTriangle, label: "Near budget" },
  over: { track: "bg-rose-100", bar: "bg-destructive", text: "text-destructive", Icon: XCircle, label: "Over budget" },
};

export function BudgetBar({ usage, compact }: { usage: BudgetUsage | null; compact?: boolean }) {
  if (!usage) return <span className="text-xs text-muted-foreground">No budget</span>;
  const l = LEVEL[usage.level];
  return (
    <div className={cn("w-full", compact ? "min-w-28" : "")}>
      <Progress
        value={Math.min(usage.percentUsed, 100)}
        className={l.track}
        indicatorClassName={l.bar}
        aria-label={`${usage.percentUsed}% of budget used`}
      />
      <div className="mt-1 flex items-center gap-1 text-xs">
        <l.Icon className={cn("size-3.5", l.text)} aria-hidden />
        <span className={cn("font-mono font-medium tabular-nums", usage.level === "over" && l.text)}>
          {usage.percentUsed}%
        </span>
        {!compact && <span className="text-muted-foreground">used · {l.label}</span>}
      </div>
    </div>
  );
}
