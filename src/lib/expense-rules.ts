import { can, type Role } from "@/lib/permissions";

// Who may do what with an existing expense (business rules 4–5). Pure, so the UI can
// hide buttons with the same logic the service layer enforces. Project access is checked
// separately by the service.

type Actor = { id: number; role: Role };
type ExpenseLike = { status: "PENDING" | "APPROVED" | "REJECTED"; createdById: number };

export function canEditExpense(actor: Actor, e: ExpenseLike): boolean {
  // Approved entries are locked; only Admin can unlock/edit (logged).
  if (e.status === "APPROVED") return can.editApprovedExpenses(actor.role);
  // Pending / rejected: the creator (rejected -> resubmit) or Admin/Accountant.
  return e.createdById === actor.id || can.approveExpenses(actor.role);
}

export function canDeleteExpense(actor: Actor, e: ExpenseLike): boolean {
  return canEditExpense(actor, e);
}

export function canApproveExpense(actor: Actor, e: ExpenseLike): boolean {
  return e.status === "PENDING" && can.approveExpenses(actor.role);
}

/** Status for a newly saved/resubmitted entry (auto-approve setting, business rule 5). */
export function initialStatus(actor: Actor, autoApprovePrivileged: boolean): "PENDING" | "APPROVED" {
  return autoApprovePrivileged && can.approveExpenses(actor.role) ? "APPROVED" : "PENDING";
}
