import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Clock, Filter, Pencil, PiggyBank, Plus, Undo2 } from "lucide-react";
import { Field } from "@/components/forms/field";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { ExpenseStatusBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatPKR, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/validation/expenses";
import { EMPLOYEE_TYPE_LABELS } from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getCashStatement } from "@/server/services/cash-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata = { title: "Cash statement" };

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function CashStatementPage({ params, searchParams }: PageProps<"/cash/[workerId]">) {
  const actor = await requireUser();
  const workerId = parseId((await params).workerId);
  const sp = await searchParams;
  const from = isoDate(sp.from);
  const to = isoDate(sp.to);

  const [st, settings] = await Promise.all([pageData(getCashStatement(actor, workerId, { from, to })), getSettings()]);
  const { worker, current } = st;
  const cur = settings.currencyLabel;
  const manage = can.manageCash(actor.role);
  const amountCell = "text-right font-mono tabular-nums";
  const balance = current?.balance;

  return (
    <>
      <PageHeader
        title={`${worker.name} — cash statement`}
        description={[worker.designation ?? EMPLOYEE_TYPE_LABELS[worker.employeeType], worker.phone].filter(Boolean).join(" · ")}
        actions={
          <>
            {manage && worker.isActive && (
              <>
                <Link href={`/cash/new?workerId=${worker.id}`} className={buttonVariants()}>
                  <Plus /> Give funds
                </Link>
                <Link href={`/cash/new?workerId=${worker.id}&type=RETURNED`} className={buttonVariants({ variant: "outline" })}>
                  <Undo2 /> Cash returned
                </Link>
              </>
            )}
            {(manage || worker.userId === actor.id) && (
              <Link href={`/expenses/new?paidFromId=${worker.id}`} className={buttonVariants({ variant: manage ? "ghost" : "default" })}>
                <Plus /> Record expense
              </Link>
            )}
          </>
        }
      />
      {typeof sp.saved === "string" && (
        <Notice variant="success" className="mb-4">
          Saved {sp.saved}.
        </Notice>
      )}
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Cash entry deleted.
        </Notice>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label={balance?.isNegative() ? "Owed to employee" : "Cash in hand"}
          icon={PiggyBank}
          tone={balance?.isNegative() ? "danger" : undefined}
          value={formatPKR(balance?.abs() ?? 0, cur)}
          sub="Today, all dates"
        />
        <Kpi
          label="Received"
          icon={ArrowDownLeft}
          value={formatPKR(current ? current.opening.plus(current.issued) : 0, cur)}
          sub={current && !current.opening.isZero() ? `incl. ${formatPKR(current.opening, cur)} previous balance` : undefined}
        />
        <Kpi
          label="Spent & returned"
          icon={ArrowUpRight}
          value={formatPKR(current ? current.spent.plus(current.returned) : 0, cur)}
          sub={current && !current.returned.isZero() ? `incl. ${formatPKR(current.returned, cur)} returned` : undefined}
        />
        <Kpi
          label="Awaiting approval"
          icon={Clock}
          tone={current?.pendingCount ? "warning" : undefined}
          value={formatPKR(current?.pendingSpent ?? 0, cur)}
          sub={`${plural(current?.pendingCount ?? 0, "expense")} — not taken off yet`}
        />
      </div>

      <Card className="mb-4 py-3 sm:py-4 print:hidden">
        <CardContent className="px-3 sm:px-4">
          <form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Field label="From" className="sm:w-44">
              <DatePicker name="from" defaultValue={from ?? ""} clearable />
            </Field>
            <Field label="To" className="sm:w-44">
              <DatePicker name="to" defaultValue={to ?? ""} clearable />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                <Filter /> Filter
              </Button>
              {(from || to) && (
                <Link href={`/cash/${worker.id}`} className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>No.</TableHead>
              <TableHead className="min-w-64">Details</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {st.broughtForward && (
              <TableRow className="bg-muted/40">
                <TableCell className="font-mono text-xs tabular-nums">{formatDate(from)}</TableCell>
                <TableCell />
                <TableCell className="font-medium">Brought forward</TableCell>
                <TableCell />
                <TableCell />
                <TableCell className={cn(amountCell, "font-semibold")}>{formatAmount(st.broughtForward)}</TableCell>
              </TableRow>
            )}
            {st.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No cash entries or expenses {from || to ? "in this period" : "yet"}.
                </TableCell>
              </TableRow>
            )}
            {st.rows.map((r) => (
              <TableRow key={r.key} className={cn(r.status === "PENDING" && "text-muted-foreground")}>
                <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">{formatDate(r.date)}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">
                  {r.kind === "expense" ? (
                    <Link href={`/expenses/${r.id}`} className="text-primary hover:underline">
                      {r.number}
                    </Link>
                  ) : manage ? (
                    <Link href={`/cash/entry/${r.id}/edit`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {r.number} <Pencil className="size-3" />
                    </Link>
                  ) : (
                    r.number
                  )}
                </TableCell>
                <TableCell>
                  <span className="block">{r.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {[r.project?.code, PAYMENT_MODE_LABELS[r.paymentMode as PaymentMode]].filter(Boolean).join(" · ")}
                  </span>{" "}
                  {r.status === "PENDING" && <ExpenseStatusBadge status="PENDING" />}
                </TableCell>
                <TableCell className={cn(amountCell, "text-emerald-700")}>{r.moneyIn ? formatAmount(r.moneyIn) : ""}</TableCell>
                <TableCell className={amountCell}>{r.moneyOut ? formatAmount(r.moneyOut) : ""}</TableCell>
                <TableCell className={cn(amountCell, r.balance?.isNegative() && "text-destructive")}>
                  {r.balance ? formatAmount(r.balance) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {st.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={5} className="font-semibold">
                  Closing balance{to ? ` on ${formatDate(to)}` : ""}
                </TableCell>
                <TableCell className={cn(amountCell, "font-semibold", st.closing.isNegative() && "text-destructive")}>
                  {formatAmount(st.closing)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Expenses appear here when they are entered with &ldquo;Paid from: {worker.name}&rdquo;. Pending expenses are shown
        greyed out and only reduce the balance once approved; rejected ones are left out.
      </p>
    </>
  );
}
