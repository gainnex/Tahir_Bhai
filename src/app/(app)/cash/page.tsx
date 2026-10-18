import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, PiggyBank, Plus, Users } from "lucide-react";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { ActiveBadge } from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatPKR, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EMPLOYEE_TYPE_LABELS } from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { listCashHolders } from "@/server/services/cash-service";
import { ownEmployeeId } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cash in hand" };

export default async function CashPage() {
  const actor = await requireUser();
  if (!can.manageCash(actor.role)) {
    // Site in-charges only have their own statement (if their login is linked to an employee)
    const own = await ownEmployeeId(actor.id);
    if (own) redirect(`/cash/${own}`);
    return (
      <>
        <PageHeader title="Cash in hand" />
        <Notice>
          Your login is not linked to an employee record, so there is no cash statement to show. Ask the admin to link it
          under Employees → Edit → Login account.
        </Notice>
      </>
    );
  }
  const [{ rows, held, owed, heldCount, owedCount }, settings] = await Promise.all([
    listCashHolders(actor),
    getSettings(),
  ]);
  const cur = settings.currencyLabel;
  const pending = rows.reduce((n, r) => n + r.pendingCount, 0);
  const amountCell = "text-right font-mono tabular-nums";

  return (
    <>
      <PageHeader
        title="Cash in hand"
        description="Money given to employees, what they spent from it, and what they still hold"
        actions={
          <Link href="/cash/new" className={buttonVariants()}>
            <Plus /> Give funds
          </Link>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi label="Held by employees" icon={PiggyBank} value={formatPKR(held, cur)} sub={plural(heldCount, "employee") + " holding cash"} />
        <Kpi
          label="Owed to employees"
          icon={Users}
          tone={owedCount ? "danger" : undefined}
          value={formatPKR(owed, cur)}
          sub={owedCount ? `${plural(owedCount, "employee")} spent more than they were given` : "Nobody is out of pocket"}
        />
        <Kpi
          label="Spending awaiting approval"
          icon={Clock}
          tone={pending ? "warning" : undefined}
          value={String(pending)}
          sub="Expenses not taken off balances until approved"
        />
      </div>

      {/* Phones: cards */}
      <div className="space-y-2 sm:hidden">
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No cash given to anyone yet.</p>}
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/cash/${r.id}`}
            className="block rounded-lg border border-border/60 bg-card p-3 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-primary">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.designation ?? EMPLOYEE_TYPE_LABELS[r.employeeType]}</div>
              </div>
              <div className={cn("font-mono font-semibold tabular-nums", r.balance.isNegative() && "text-destructive")}>
                {formatAmount(r.balance)}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-border/60 bg-card shadow-xs sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Opening</TableHead>
              <TableHead className="text-right">Given</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead className="text-right">Spent</TableHead>
              <TableHead className="text-right">Balance ({cur})</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Pending</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No cash given to anyone yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/cash/${r.id}`} className="font-medium text-primary hover:underline">
                    {r.name}
                  </Link>{" "}
                  {!r.isActive && <ActiveBadge active={false} />}
                  <span className="block text-xs text-muted-foreground">
                    {r.designation ?? EMPLOYEE_TYPE_LABELS[r.employeeType]}
                  </span>
                </TableCell>
                <TableCell className={amountCell}>{formatAmount(r.opening)}</TableCell>
                <TableCell className={amountCell}>{formatAmount(r.issued)}</TableCell>
                <TableCell className={amountCell}>{formatAmount(r.returned)}</TableCell>
                <TableCell className={amountCell}>{formatAmount(r.spent)}</TableCell>
                <TableCell className={cn(amountCell, "font-semibold", r.balance.isNegative() && "text-destructive")}>
                  {formatAmount(r.balance)}
                </TableCell>
                <TableCell className={cn(amountCell, "hidden text-muted-foreground lg:table-cell")}>
                  {r.pendingCount ? formatAmount(r.pendingSpent) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {rows.length > 1 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Net total</TableCell>
                <TableCell colSpan={4} />
                <TableCell className={cn(amountCell, "font-semibold")}>{formatAmount(held.minus(owed))}</TableCell>
                <TableCell className="hidden lg:table-cell" />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Balance = opening + given − returned − approved spending. A red balance means the employee spent their own money
        and the company owes it to them. Permanent and part-time staff are always listed; labour only once they have cash
        activity.
      </p>
    </>
  );
}
