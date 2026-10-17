import Link from "next/link";
import { ExpenseStatusBadge } from "@/components/status-badges";
import { formatAmount, formatDate } from "@/lib/format";
import { ExpenseMiniDataTable, type MiniRow } from "./expense-mini-data-table";

export type ExpenseRow = {
  id: number;
  expenseNo: string;
  date: Date;
  amount: { toString(): string };
  paidTo: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  project: { code: string; name: string };
  head: { name: string };
  subhead: { name: string };
};

/** Compact read-only expense list used on profile pages. */
export function ExpenseMiniTable({
  rows,
  currency = "PKR",
  showProject = true,
  showPaidTo = false,
  empty = "No expenses yet.",
}: {
  rows: ExpenseRow[];
  currency?: string;
  showProject?: boolean;
  showPaidTo?: boolean;
  empty?: string;
}) {
  // Plain, serializable rows for the client table (Prisma Decimal -> decimal string)
  const data: MiniRow[] = rows.map((e) => ({
    id: e.id,
    expenseNo: e.expenseNo,
    date: e.date.toISOString(),
    amount: e.amount.toString(),
    paidTo: e.paidTo,
    status: e.status,
    projectCode: e.project.code,
    projectName: e.project.name,
    head: e.head.name,
    subhead: e.subhead.name,
  }));
  return (
    <>
      {/* Phones: compact cards */}
      <div className="space-y-2 sm:hidden">
        {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>}
        {rows.map((e) => (
          <Link
            key={e.id}
            href={`/expenses/${e.id}`}
            className="block rounded-lg border border-border/60 bg-card p-3 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{e.paidTo}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatDate(e.date)}</span> ·{" "}
                  {showProject ? `${e.project.code} · ` : ""}
                  {e.head.name} / {e.subhead.name}
                </div>
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <div className="font-mono text-sm font-semibold tabular-nums">{formatAmount(e.amount)}</div>
                <ExpenseStatusBadge status={e.status} />
              </div>
            </div>
          </Link>
        ))}
      </div>
      <ExpenseMiniDataTable
        rows={data}
        currency={currency}
        showProject={showProject}
        showPaidTo={showPaidTo}
        empty={empty}
        className="hidden sm:block"
      />
    </>
  );
}
