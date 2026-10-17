import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** KPI metric card: label, one big tabular value, optional period badge, icon and trend sub-line. */
export function Kpi({
  label,
  value,
  sub,
  period,
  icon: Icon,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Small badge in the corner, e.g. "This month". */
  period?: string;
  icon?: LucideIcon;
  /** Colours the value, e.g. "danger" for over-budget counts. */
  tone?: "danger" | "warning" | "success";
}) {
  return (
    <Card className="gap-2 sm:gap-3">
      <CardHeader className="gap-1">
        <CardDescription className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          {Icon && <Icon className="size-3.5" aria-hidden />}
          {label}
        </CardDescription>
        <CardTitle
          className={cn(
            "font-mono text-xl font-semibold tabular-nums sm:text-2xl",
            tone === "danger" && "text-destructive",
            tone === "warning" && "text-amber-700",
            tone === "success" && "text-emerald-700",
          )}
        >
          {value}
        </CardTitle>
        {period && (
          <CardAction>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {period}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {sub && <CardFooter className="text-xs text-muted-foreground">{sub}</CardFooter>}
    </Card>
  );
}
