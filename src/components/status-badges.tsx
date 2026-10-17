import { CheckCircle2, CircleDashed, Clock, PauseCircle, PlayCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/validation/projects";

// Status → semantic Badge variant. Expense: Pending amber, Approved emerald, Rejected rose
// (docs/SCREENS.md). Always icon + text, never colour alone.
const EXPENSE = {
  PENDING: { label: "Pending", variant: "warning", Icon: Clock },
  APPROVED: { label: "Approved", variant: "success", Icon: CheckCircle2 },
  REJECTED: { label: "Rejected", variant: "danger", Icon: XCircle },
} as const;

export function ExpenseStatusBadge({ status }: { status: keyof typeof EXPENSE }) {
  const s = EXPENSE[status];
  return (
    <Badge variant={s.variant}>
      <s.Icon /> {s.label}
    </Badge>
  );
}

const PROJECT = {
  ACTIVE: { variant: "info", Icon: PlayCircle },
  ON_HOLD: { variant: "warning", Icon: PauseCircle },
  COMPLETED: { variant: "neutral", Icon: CheckCircle2 },
} as const;

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT[status];
  return (
    <Badge variant={s.variant}>
      <s.Icon /> {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Active / Inactive for users, workers, heads. */
export function ActiveBadge({ active, inactiveLabel = "Inactive" }: { active: boolean; inactiveLabel?: string }) {
  return active ? (
    <Badge variant="success">
      <CheckCircle2 /> Active
    </Badge>
  ) : (
    <Badge variant="neutral">
      <CircleDashed /> {inactiveLabel}
    </Badge>
  );
}

/** Over-budget flag next to project names / KPIs. */
export function OverBudgetBadge() {
  return (
    <Badge variant="danger">
      <XCircle /> Over budget
    </Badge>
  );
}
