import { Prisma } from "@prisma/client";
import { budgetLevel, type BudgetUsage } from "@/lib/budget";
import { db } from "@/lib/db";

// Business rule 6 + 8: only APPROVED, non-deleted expenses count in totals.
// Every total in the app must start from this filter.
export const COUNTABLE: Prisma.ExpenseWhereInput = { status: "APPROVED", deletedAt: null };

const ZERO = new Prisma.Decimal(0);

/** Approved spend per project id. Projects with no spend are absent (treat as 0). */
export async function spentByProject(projectIds?: number[]) {
  const rows = await db.expense.groupBy({
    by: ["projectId"],
    where: { ...COUNTABLE, ...(projectIds ? { projectId: { in: projectIds } } : {}) },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.projectId, r._sum.amount ?? ZERO]));
}

/** null when the project has no budget. */
export function budgetUsage(
  budget: Prisma.Decimal | null,
  spent: Prisma.Decimal = ZERO,
): BudgetUsage | null {
  if (!budget || budget.isZero()) return null;
  const percent = spent.div(budget).mul(100);
  return {
    budget: budget.toFixed(2),
    spent: spent.toFixed(2),
    remaining: budget.minus(spent).toFixed(2),
    percentUsed: percent.toDecimalPlaces(1).toNumber(),
    level: budgetLevel(percent.toNumber()),
  };
}
