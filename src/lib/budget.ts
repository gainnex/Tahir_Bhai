// Budget bar colours (docs/SCREENS.md): green < 80 %, amber 80–100 %, red > 100 %.

export type BudgetLevel = "ok" | "warning" | "over";

export function budgetLevel(percentUsed: number): BudgetLevel {
  if (percentUsed > 100) return "over";
  if (percentUsed >= 80) return "warning";
  return "ok";
}

/** Serializable budget usage, computed on the server from Decimals. */
export type BudgetUsage = {
  budget: string; // decimal string
  spent: string;
  remaining: string; // may be negative
  percentUsed: number; // rounded to 1 decimal, for display only
  level: BudgetLevel;
};
