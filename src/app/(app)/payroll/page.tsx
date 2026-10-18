import Link from "next/link";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  Filter,
  HandCoins,
  Pencil,
  Plus,
  Send,
  Wallet,
} from "lucide-react";
import { Field } from "@/components/forms/field";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { ReportView } from "@/components/report-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatPKR, todayPK } from "@/lib/format";
import { monthLabel, parseMonth, shiftMonth } from "@/lib/payroll";
import { cn } from "@/lib/utils";
import { EMPLOYEE_TYPE_LABELS, EMPLOYEE_TYPES, type EmployeeType } from "@/lib/validation/parties";
import { PAY_ADDITIONS, PAY_ADJUSTMENT_LABELS } from "@/lib/validation/payroll";
import { requireRole } from "@/server/auth";
import { getWageSheet, listPayAdjustments, wageSheetReport } from "@/server/services/payroll-service";
import { listProjectOptions } from "@/server/services/project-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata = { title: "Wage sheet" };

export default async function PayrollPage({ searchParams }: PageProps<"/payroll">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const thisMonth = todayPK().slice(0, 7);
  const month = parseMonth(sp.month) ?? thisMonth;
  const employeeType = EMPLOYEE_TYPES.includes(sp.type as EmployeeType) ? (sp.type as EmployeeType) : undefined;
  const costCenterId = typeof sp.cc === "string" && /^\d+$/.test(sp.cc) ? Number(sp.cc) : undefined;
  const opts = { employeeType, costCenterId };

  const [sheet, report, adjustments, centers, settings] = await Promise.all([
    getWageSheet(actor, month, opts),
    wageSheetReport(actor, month, opts),
    listPayAdjustments(actor, month),
    listProjectOptions(actor),
    getSettings(),
  ]);
  const cur = settings.currencyLabel;
  const q = (extra: Record<string, string | undefined>) =>
    new URLSearchParams(
      Object.entries({
        month,
        type: employeeType,
        cc: costCenterId ? String(costCenterId) : undefined,
        ...extra,
      }).filter(([, v]) => v) as [string, string][],
    ).toString();

  return (
    <>
      <PageHeader
        title={`Wage sheet — ${monthLabel(month)}`}
        description="Attendance × rate, plus benefits, less deductions and what has already been paid"
        actions={
          <>
            <Link
              href={`/payroll?${q({ month: shiftMonth(month, -1) })}`}
              className={buttonVariants({ variant: "outline", size: "icon" })}
              aria-label="Previous month"
            >
              <ChevronLeft />
            </Link>
            {month < thisMonth && (
              <Link
                href={`/payroll?${q({ month: shiftMonth(month, 1) })}`}
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label="Next month"
              >
                <ChevronRight />
              </Link>
            )}
            <Link href={`/payroll/post?month=${month}`} className={buttonVariants()}>
              <Send /> Post wages
            </Link>
            <Link href={`/payroll/adjustments/new?month=${month}`} className={buttonVariants({ variant: "outline" })}>
              <Plus /> Benefit / deduction
            </Link>
            <a href={`/api/reports/wage-sheet?format=xlsx&${q({})}`} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheet /> Excel
            </a>
            <a href={`/api/reports/wage-sheet?format=pdf&${q({})}`} className={buttonVariants({ variant: "outline" })}>
              <FileText /> PDF
            </a>
          </>
        }
      />
      {typeof sp.saved === "string" && (
        <Notice variant="success" className="mb-4">
          Saved {sp.saved}.
        </Notice>
      )}
      {typeof sp.posted === "string" && (
        <Notice variant="success" className="mb-4">
          Posted {sp.posted} wage payment{sp.posted === "1" ? "" : "s"} to the employees&rsquo; cost centers. They are
          under Expenses (reference WAGES-{month}).
        </Notice>
      )}
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Entry deleted.
        </Notice>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Net payable"
          icon={Wallet}
          value={formatPKR(sheet.totals.net, cur)}
          sub={`Basic ${formatPKR(sheet.totals.basic, cur)}`}
        />
        <Kpi
          label="Paid"
          icon={Banknote}
          value={formatPKR(sheet.totals.paid, cur)}
          sub="Approved labour payments this month"
        />
        <Kpi
          label="Still to pay"
          icon={HandCoins}
          tone={sheet.toPay.isZero() ? undefined : "warning"}
          value={formatPKR(sheet.toPay, cur)}
          sub={
            sheet.paidAhead.isZero()
              ? "Click an employee's balance due to pay it"
              : `${formatPKR(sheet.paidAhead, cur)} paid ahead of attendance (negative balances)`
          }
        />
        <Kpi
          label="Advances outstanding"
          icon={HandCoins}
          value={formatPKR(sheet.totals.advanceBalance, cur)}
          sub="Given less recovered, to month end"
        />
      </div>

      {/* Employee type filter (tabs look; each is a URL) and cost center filter */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <nav
          aria-label="Employee type"
          className="inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg bg-muted p-[3px] text-muted-foreground"
        >
          {[undefined, ...EMPLOYEE_TYPES].map((t) => (
            <Link
              key={t ?? "all"}
              href={`/payroll?${q({ type: t ?? "" })}`}
              aria-current={employeeType === t ? "page" : undefined}
              className={cn(
                "inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors hover:text-foreground",
                employeeType === t && "bg-background text-foreground shadow-sm",
              )}
            >
              {t ? EMPLOYEE_TYPE_LABELS[t] : "All"}
            </Link>
          ))}
        </nav>
        <form className="flex items-end gap-2">
          <input type="hidden" name="month" value={month} />
          {employeeType && <input type="hidden" name="type" value={employeeType} />}
          <Field label="Cost center" className="w-64">
            <Combobox
              name="cc"
              defaultValue={costCenterId ? String(costCenterId) : ""}
              clearLabel="All cost centers"
              placeholder="All cost centers"
              searchPlaceholder="Search projects / offices…"
              options={centers.map((p) => ({
                value: String(p.id),
                label: `${p.code} — ${p.name}`,
                hint: p.isHeadOffice ? "Head office" : p.isSubOffice ? "Sub office" : undefined,
              }))}
            />
          </Field>
          <Button type="submit" variant="secondary">
            <Filter /> Filter
          </Button>
        </form>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{report.subtitle}</p>
      <ReportView report={report} />

      <h2 className="mt-8 mb-3 text-base font-semibold">Benefits & deductions — {monthLabel(month)}</h2>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>No.</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="min-w-48">Notes</TableHead>
              <TableHead className="text-right">Amount ({cur})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  None this month.
                </TableCell>
              </TableRow>
            )}
            {adjustments.map((a) => {
              const adds = PAY_ADDITIONS.includes(a.type);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap tabular-nums">
                    {formatDate(a.date)}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    <Link
                      href={`/payroll/adjustments/${a.id}/edit`}
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {a.entryNo} <Pencil className="size-3" />
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/workers/${a.worker.id}`} className="hover:underline">
                      {a.worker.name}
                    </Link>
                  </TableCell>
                  <TableCell>{PAY_ADJUSTMENT_LABELS[a.type]}</TableCell>
                  <TableCell className="text-muted-foreground">{a.notes}</TableCell>
                  <TableCell
                    className={cn("text-right font-mono tabular-nums", adds ? "text-emerald-700" : "text-destructive")}
                  >
                    {adds ? "+" : "−"}
                    {formatAmount(a.amount)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Pay wages with a{" "}
        <Link href="/labour-payment" className="underline underline-offset-2">
          labour payment
        </Link>{" "}
        (Workers head) — approved payments for the month appear under &ldquo;Paid&rdquo;. Advances are labour payments
        under &ldquo;Advance to labour&rdquo;; recover them here with &ldquo;Advance recovery&rdquo;. Daily-rate workers
        are paid for present days; monthly staff in full less absent days (salary ÷ days in month per day).
      </p>
    </>
  );
}
