import Link from "next/link";
import { HandCoins, Plus, Search } from "lucide-react";
import { Field } from "@/components/forms/field";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { ActiveBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { formatPKR, rateLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import {
  EMPLOYEE_TYPE_LABELS,
  EMPLOYEE_TYPES,
  TRADE_LABELS,
  TRADES,
  type EmployeeType,
  type Trade,
} from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { listWorkers, type WorkerFilters } from "@/server/services/worker-service";
import { WorkersTable, type WorkerListRow } from "./workers-table";

export const metadata = { title: "Employees" };

export default async function WorkersPage({ searchParams }: PageProps<"/workers">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const trade = TRADES.includes(sp.trade as Trade) ? (sp.trade as Trade) : undefined;
  const employeeType = EMPLOYEE_TYPES.includes(sp.type as EmployeeType) ? (sp.type as EmployeeType) : undefined;
  const active = (["active", "inactive", "all"] as const).find((a) => a === sp.active) ?? "active";
  const filters: WorkerFilters = { q, trade, employeeType, active };

  const [workers, settings] = await Promise.all([listWorkers(actor, filters), getSettings()]);
  const cur = settings.currencyLabel;
  const canManage = can.manageWorkers(actor.role);
  const filtered = q || trade || employeeType || active !== "active";

  const rows: WorkerListRow[] = workers.map((w) => ({
    id: w.id,
    name: w.name,
    employeeType: w.employeeType,
    designation: w.designation ?? "",
    trade: w.trade,
    rate: w.rate.toString(),
    rateType: w.rateType,
    cnic: w.cnic ?? "",
    defaultProjectCode: w.defaultProject?.code ?? "",
    defaultProjectName: w.defaultProject?.name ?? "",
    totalPaid: w.totalPaid.toString(),
    status: w.isActive ? "active" : "inactive",
  }));

  return (
    <>
      <PageHeader
        title="Employees"
        description={
          can.seeAllProjects(actor.role)
            ? "Labour and staff register"
            : "Labour and staff register — totals include only your projects"
        }
        actions={
          <>
            <Link href="/labour-payment" className={buttonVariants({ variant: "outline" })}>
              <HandCoins /> Labour payment
            </Link>
            {canManage && (
              <Link href="/workers/new" className={buttonVariants()}>
                <Plus /> New employee
              </Link>
            )}
          </>
        }
      />
      {sp.deleted && (
        <Notice variant="success" className="mb-4">
          Employee deleted.
        </Notice>
      )}

      {/* GET form, so filtered views can be bookmarked/shared */}
      <Card className="mb-4 py-3 sm:py-4">
        <CardContent className="px-3 sm:px-4">
          <form role="search" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <Field label="Search" htmlFor="q" className="sm:w-72">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="q" name="q" defaultValue={q} placeholder="Search name, CNIC or phone" className="pl-8" />
              </div>
            </Field>
            <Field label="Type" className="sm:w-44">
              <Combobox
                name="type"
                defaultValue={employeeType ?? ""}
                clearLabel="All types"
                placeholder="All types"
                options={EMPLOYEE_TYPES.map((t) => ({ value: t, label: EMPLOYEE_TYPE_LABELS[t] }))}
              />
            </Field>
            <Field label="Trade" className="sm:w-44">
              <Combobox
                name="trade"
                defaultValue={trade ?? ""}
                clearLabel="All trades"
                placeholder="All trades"
                options={TRADES.map((t) => ({ value: t, label: TRADE_LABELS[t] }))}
              />
            </Field>
            <Field label="Status" className="sm:w-36">
              <Combobox
                name="active"
                defaultValue={active}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "all", label: "All" },
                ]}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary">
                <Search /> Filter
              </Button>
              {filtered && (
                <Link href="/workers" className={buttonVariants({ variant: "ghost" })}>
                  Clear
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Phones: cards */}
      <div className="space-y-2 sm:hidden">
        {workers.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No employees found.</p>}
        {workers.map((w) => (
          <Link
            key={w.id}
            href={`/workers/${w.id}`}
            className="block rounded-lg border border-border/60 bg-card p-3 shadow-xs active:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-primary">{w.name}</div>
                <div className="text-xs text-muted-foreground">
                  {w.designation ?? (w.employeeType === "LABOUR" ? TRADE_LABELS[w.trade] : EMPLOYEE_TYPE_LABELS[w.employeeType])} ·{" "}
                  <span className="font-mono tabular-nums">{rateLabel(w.rate, w.rateType, cur)}</span>
                </div>
              </div>
              {!w.isActive && <ActiveBadge active={false} />}
            </div>
            <div className="mt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Total paid</span>
              <span className="font-mono font-medium tabular-nums">{formatPKR(w.totalPaid, cur)}</span>
            </div>
          </Link>
        ))}
      </div>

      <WorkersTable
        rows={rows}
        currency={cur}
        canManage={canManage}
        emptyText={filtered ? "No employees match these filters." : "No employees yet."}
      />
    </>
  );
}
