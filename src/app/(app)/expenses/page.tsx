import Link from "next/link";
import { CircleCheck, FileSpreadsheet, FileText, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { ExpenseStatusBadge } from "@/components/status-badges";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { canApproveExpense, canEditExpense } from "@/lib/expense-rules";
import { formatAmount, formatDate, formatPKR } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUSES,
  parseExpenseFilters,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type ExpenseFilters,
} from "@/lib/validation/expenses";
import { requireUser } from "@/server/auth";
import { listExpenses } from "@/server/services/expense-service";
import { listProjectOptions } from "@/server/services/project-service";
import { getSettings } from "@/server/services/settings-service";
import { ExpensesTable, type ExpenseListRow } from "./expenses-table";

export const metadata = { title: "Expenses" };

function queryString(f: ExpenseFilters, page?: number) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, page })) {
    if (v !== undefined && v !== null && v !== "" && !(k === "page" && v === 1)) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

const str = (v: number | string | undefined) => (v === undefined ? "" : String(v));

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const f = parseExpenseFilters(sp);
  const privileged = can.seeAllProjects(actor.role);

  const [result, settings, projects, heads, vendors, workers, users] = await Promise.all([
    listExpenses(actor, f),
    getSettings(),
    listProjectOptions(actor),
    db.expenseHead.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, subheads: { select: { id: true, name: true }, orderBy: { name: "asc" } } },
    }),
    db.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.worker.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    privileged ? db.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const cur = settings.currencyLabel;
  const hasFilters = Object.entries(f).some(([k, v]) => k !== "page" && k !== "sort" && v !== undefined);
  const clients = [...new Set(projects.map((p) => p.clientName).filter((c): c is string => !!c))].sort();
  const moreOpen = !!(f.client || f.subheadId || f.vendorId || f.workerId || f.createdById || f.paymentMode || f.minAmount || f.maxAmount);
  const exportQs = queryString({ ...f, page: 1 });
  const exportHref = (format: string) => `/api/reports/expenses${exportQs || "?"}${exportQs ? "&" : ""}format=${format}`;

  const rows: ExpenseListRow[] = result.rows.map((e) => ({
    id: e.id,
    expenseNo: e.expenseNo,
    date: e.date.toISOString(),
    amount: e.amount.toString(),
    paidTo: e.paidTo,
    description: e.description,
    status: e.status,
    paymentMode: e.paymentMode,
    projectCode: e.project.code,
    projectName: e.project.name,
    head: e.head.name,
    subhead: e.subhead.name,
    isSplit: !!e.splitGroupId,
    attachments: e._count.attachments,
    canEdit: canEditExpense(actor, e),
    canApprove: canApproveExpense(actor, e),
  }));

  return (
    <>
      <PageHeader
        title="Expenses"
        description={privileged ? "All expenses" : "Expenses on your projects"}
        actions={
          <>
            <a href={exportHref("xlsx")} className={buttonVariants({ variant: "outline" })}>
              <FileSpreadsheet /> Excel
            </a>
            <a href={exportHref("pdf")} className={buttonVariants({ variant: "outline" })}>
              <FileText /> PDF
            </a>
            <Link href="/expenses/new" className={buttonVariants()}>
              <Plus /> New expense
            </Link>
          </>
        }
      />
      {sp.deleted && (
        <Alert variant="success" className="mb-4">
          <CircleCheck />
          <AlertDescription className="text-inherit">
            {Number(sp.deleted) > 1 ? `Split bill deleted (${sp.deleted} lines).` : "Expense deleted."}
          </AlertDescription>
        </Alert>
      )}

      {/* ---- Filters (GET form, so filtered views can be bookmarked/shared) ---- */}
      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form role="search">
            {f.sort && <input type="hidden" name="sort" value={f.sort} />}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Field label="Search" htmlFor="q" className="lg:col-span-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="q" name="q" defaultValue={f.q} placeholder="Paid to, description, no., cheque…" className="pl-8" />
                </div>
              </Field>
              <Field label="From">
                <DatePicker name="from" defaultValue={f.from ?? ""} placeholder="Any date" clearable />
              </Field>
              <Field label="To">
                <DatePicker name="to" defaultValue={f.to ?? ""} placeholder="Any date" clearable />
              </Field>
              <Field label="Project">
                <Combobox
                  name="projectId"
                  defaultValue={str(f.projectId)}
                  clearLabel="All projects"
                  placeholder="All projects"
                  searchPlaceholder="Search projects…"
                  options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
                />
              </Field>
              <Field label="Status">
                <Combobox
                  name="status"
                  defaultValue={f.status ?? ""}
                  clearLabel="All statuses"
                  placeholder="All statuses"
                  options={EXPENSE_STATUSES.map((s) => ({ value: s, label: EXPENSE_STATUS_LABELS[s] }))}
                />
              </Field>
              <Field label="Head" className="lg:col-span-2 xl:col-span-1">
                <Combobox
                  name="headId"
                  defaultValue={str(f.headId)}
                  clearLabel="All heads"
                  placeholder="All heads"
                  searchPlaceholder="Search heads…"
                  options={heads.map((h) => ({ value: String(h.id), label: h.name }))}
                />
              </Field>
            </div>

            <details className="group mt-3" open={moreOpen}>
              <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                <SlidersHorizontal className="size-4" /> More filters
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <Field label="Client">
                  <Combobox
                    name="client"
                    defaultValue={f.client ?? ""}
                    clearLabel="All clients"
                    placeholder="All clients"
                    searchPlaceholder="Search clients…"
                    options={clients.map((c) => ({ value: c, label: c }))}
                  />
                </Field>
                <Field label="Sub-head" className="lg:col-span-2">
                  <Combobox
                    name="subheadId"
                    defaultValue={str(f.subheadId)}
                    clearLabel="All sub-heads"
                    placeholder="All sub-heads"
                    searchPlaceholder="Search sub-heads…"
                    options={heads.flatMap((h) =>
                      h.subheads.map((s) => ({ value: String(s.id), label: s.name, group: h.name, keywords: [h.name] })),
                    )}
                  />
                </Field>
                <Field label="Vendor">
                  <Combobox
                    name="vendorId"
                    defaultValue={str(f.vendorId)}
                    clearLabel="Any vendor"
                    placeholder="Any vendor"
                    searchPlaceholder="Search vendors…"
                    options={vendors.map((v) => ({ value: String(v.id), label: v.name }))}
                  />
                </Field>
                <Field label="Worker">
                  <Combobox
                    name="workerId"
                    defaultValue={str(f.workerId)}
                    clearLabel="Any worker"
                    placeholder="Any worker"
                    searchPlaceholder="Search workers…"
                    options={workers.map((w) => ({ value: String(w.id), label: w.name }))}
                  />
                </Field>
                <Field label="Payment mode">
                  <Combobox
                    name="paymentMode"
                    defaultValue={f.paymentMode ?? ""}
                    clearLabel="Any mode"
                    placeholder="Any mode"
                    options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
                  />
                </Field>
                {privileged && (
                  <Field label="Entered by">
                    <Combobox
                      name="createdById"
                      defaultValue={str(f.createdById)}
                      clearLabel="Anyone"
                      placeholder="Anyone"
                      searchPlaceholder="Search users…"
                      options={users.map((u) => ({ value: String(u.id), label: u.name }))}
                    />
                  </Field>
                )}
                <Field label="Min amount" htmlFor="minAmount">
                  <Input
                    id="minAmount"
                    name="minAmount"
                    inputMode="decimal"
                    defaultValue={f.minAmount}
                    className="text-right font-mono tabular-nums"
                  />
                </Field>
                <Field label="Max amount" htmlFor="maxAmount">
                  <Input
                    id="maxAmount"
                    name="maxAmount"
                    inputMode="decimal"
                    defaultValue={f.maxAmount}
                    className="text-right font-mono tabular-nums"
                  />
                </Field>
              </div>
            </details>

            <div className="mt-3 flex gap-2">
              <Button type="submit" variant="secondary">
                <Search /> Apply filters
              </Button>
              {hasFilters && (
                <Link href="/expenses" className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ---- Filtered total ---- */}
      <div className="mb-3 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-card font-mono tabular-nums">
            {result.count}
          </Badge>
          <span>
            {result.count === 1 ? "expense" : "expenses"}
            {hasFilters && (result.count === 1 ? " matches these filters" : " match these filters")}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-6">
          <span>
            Total: <span className="font-mono font-semibold tabular-nums">{formatPKR(result.total, cur)}</span>
          </span>
          {!(f.status === "APPROVED") && (
            <span className="text-muted-foreground">
              of which approved:{" "}
              <span className="font-mono font-medium text-foreground tabular-nums">{formatPKR(result.approvedTotal, cur)}</span>
            </span>
          )}
        </div>
      </div>

      {/* ---- Phones: cards ---- */}
      <div className="space-y-2 sm:hidden">
        {result.rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No expenses found.</p>}
        {result.rows.map((e) => (
          <Link
            key={e.id}
            href={`/expenses/${e.id}`}
            className="block rounded-lg border border-border/60 bg-card p-3 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{e.paidTo}</div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono tabular-nums">{formatDate(e.date)}</span> · {e.project.code} · {e.head.name} /{" "}
                  {e.subhead.name}
                </div>
              </div>
              <div className="space-y-1 text-right">
                <div className="font-mono font-semibold tabular-nums">{formatAmount(e.amount)}</div>
                <ExpenseStatusBadge status={e.status} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ---- Table ---- */}
      <ExpensesTable
        rows={rows}
        currency={cur}
        sort={f.sort}
        emptyText={hasFilters ? "No expenses match these filters." : "No expenses yet."}
      />

      {/* ---- Pagination ---- */}
      {result.pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page <span className="font-mono tabular-nums">{result.page}</span> of{" "}
            <span className="font-mono tabular-nums">{result.pages}</span>
          </span>
          <div className="flex gap-2">
            {result.page > 1 && (
              <Link href={`/expenses${queryString(f, result.page - 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                ← Previous
              </Link>
            )}
            {result.page < result.pages && (
              <Link href={`/expenses${queryString(f, result.page + 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
