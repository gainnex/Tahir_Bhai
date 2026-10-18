import Link from "next/link";
import { ArrowRight, Banknote, Clock, Filter, HandCoins, Pencil, PiggyBank, Plus, Wallet } from "lucide-react";
import { ExpenseMiniTable } from "@/components/expense-mini-table";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { ActiveBadge } from "@/components/status-badges";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { formatPKR, plural, rateLabel } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EMPLOYEE_TYPE_LABELS, RATE_TYPE_LABELS, TRADE_LABELS } from "@/lib/validation/parties";
import { requireUser } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { cashBalances } from "@/server/services/cash-service";
import { getSettings } from "@/server/services/settings-service";
import { getWorkerProfile } from "@/server/services/worker-service";
import { ProjectTotalsTable, type ProjectTotalRow } from "./project-totals-table";

export const metadata = { title: "Employee" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 border-b border-border/60 py-2.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export default async function WorkerProfilePage({ params, searchParams }: PageProps<"/workers/[id]">) {
  const actor = await requireUser();
  const id = parseId((await params).id);
  const sp = await searchParams;
  const projectId = typeof sp.projectId === "string" && /^\d+$/.test(sp.projectId) ? Number(sp.projectId) : undefined;

  const [p, settings] = await Promise.all([pageData(getWorkerProfile(actor, id, { projectId })), getSettings()]);
  const { worker } = p;
  const cur = settings.currencyLabel;
  // Cash in hand: Admin/Accountant, or the employee themself via their linked login
  const seesCash = can.manageCash(actor.role) || worker.userId === actor.id;
  const cash = seesCash ? (await cashBalances([worker.id])).get(worker.id) : undefined;
  const none = <span className="text-muted-foreground">—</span>;

  const projectRows: ProjectTotalRow[] = p.byProject.map((r) => ({
    projectId: r.project.id,
    code: r.project.code,
    name: r.project.name,
    count: r.count,
    wages: r.wages.toString(),
    advances: r.advances.toString(),
    total: r.total.toString(),
  }));

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {worker.name} {!worker.isActive && <ActiveBadge active={false} />}
          </span>
        }
        description={[
          worker.designation ?? EMPLOYEE_TYPE_LABELS[worker.employeeType],
          TRADE_LABELS[worker.trade],
          rateLabel(worker.rate, worker.rateType, cur),
          worker.cnic && `CNIC ${worker.cnic}`,
          worker.phone,
          worker.defaultProject && `Default: ${worker.defaultProject.code}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {worker.isActive && (
              <Link href={`/labour-payment?workerId=${worker.id}`} className={buttonVariants()}>
                <Plus /> Record payment
              </Link>
            )}
            {can.manageWorkers(actor.role) && (
              <Link href={`/workers/${worker.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil /> Edit
              </Link>
            )}
          </>
        }
      />

      {p.projects.length > 1 && (
        <form className="mb-4 flex gap-2">
          <Combobox
            name="projectId"
            defaultValue={projectId ? String(projectId) : ""}
            clearLabel="All projects"
            placeholder="All projects"
            searchPlaceholder="Search projects…"
            options={p.projects.map((pr) => ({ value: String(pr.id), label: `${pr.code} — ${pr.name}` }))}
            className="sm:w-72"
            aria-label="Project"
          />
          <Button type="submit" variant="secondary">
            <Filter /> Filter
          </Button>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Total paid" icon={Wallet} value={formatPKR(p.totalPaid, cur)} sub={plural(p.paymentCount, "approved payment")} />
        <Kpi label="Wages & other payments" icon={Banknote} value={formatPKR(p.wagesPaid, cur)} />
        <Kpi
          label="Advances given"
          icon={HandCoins}
          value={formatPKR(p.advanceTotal, cur)}
          sub={`${plural(p.advanceCount, "advance")} · ${formatPKR(p.advanceRecovered, cur)} recovered · ${formatPKR(p.advanceTotal.minus(p.advanceRecovered), cur)} outstanding`}
        />
        <Kpi
          label="Pending approval"
          icon={Clock}
          tone={p.pendingCount > 0 ? "warning" : undefined}
          value={formatPKR(p.pendingAmount, cur)}
          sub={`${plural(p.pendingCount, "payment")} — not counted yet`}
        />
      </div>

      {seesCash && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PiggyBank className="size-4 text-muted-foreground" /> Cash in hand
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div
                className={`font-mono text-2xl font-semibold tabular-nums ${cash?.balance.isNegative() ? "text-destructive" : ""}`}
              >
                {formatPKR(cash?.balance.abs() ?? 0, cur)}
              </div>
              <p className="text-sm text-muted-foreground">
                {cash?.balance.isNegative()
                  ? "The company owes this employee (spent more than they were given)."
                  : "Money given to this employee and not yet spent or returned."}
                {cash && cash.pendingCount > 0 && ` ${formatPKR(cash.pendingSpent, cur)} of spending awaits approval.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {can.manageCash(actor.role) && worker.isActive && (
                <Link href={`/cash/new?workerId=${worker.id}`} className={buttonVariants({ variant: "outline" })}>
                  <Plus /> Give funds
                </Link>
              )}
              <Link href={`/cash/${worker.id}`} className={buttonVariants({ variant: "secondary" })}>
                Cash statement <ArrowRight />
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Contact &amp; payment details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <Row label="Type">{EMPLOYEE_TYPE_LABELS[worker.employeeType]}</Row>
            <Row label="Designation">{worker.designation ?? none}</Row>
            <Row label="Trade">{TRADE_LABELS[worker.trade]}</Row>
            <Row label="Rate">
              <span className="font-mono tabular-nums">{rateLabel(worker.rate, worker.rateType, cur)}</span>{" "}
              <span className="text-muted-foreground">({RATE_TYPE_LABELS[worker.rateType]})</span>
            </Row>
            <Row label="CNIC">{worker.cnic ? <span className="font-mono tabular-nums">{worker.cnic}</span> : none}</Row>
            <Row label="Phone">{worker.phone ? <span className="font-mono tabular-nums">{worker.phone}</span> : none}</Row>
            <Row label="Cost center">
              {/* Plain text: a site in-charge may not have access to this project */}
              {worker.defaultProject ? (
                <span>
                  <span className="font-mono">{worker.defaultProject.code}</span> — {worker.defaultProject.name}
                </span>
              ) : (
                none
              )}
            </Row>
            {can.manageWorkers(actor.role) && (
              <Row label="Login account">
                {worker.user ? <span className="font-mono">@{worker.user.username}</span> : none}
              </Row>
            )}
            <Row label="Status">
              <ActiveBadge active={worker.isActive} />
            </Row>
          </dl>
        </CardContent>
      </Card>

      <h2 className="mt-8 mb-3 text-lg font-semibold">Totals by project</h2>
      <ProjectTotalsTable
        rows={projectRows}
        currency={cur}
        totals={
          p.byProject.length > 1
            ? {
                count: p.paymentCount,
                wages: p.wagesPaid.toString(),
                advances: p.advanceTotal.toString(),
                total: p.totalPaid.toString(),
              }
            : undefined
        }
      />

      <h2 className="mt-8 mb-3 text-lg font-semibold">Payment history</h2>
      <ExpenseMiniTable rows={p.payments} currency={cur} empty="No payments yet." />

      <h2 className="mt-8 mb-3 text-lg font-semibold">Advances given</h2>
      <ExpenseMiniTable rows={p.advances} currency={cur} empty="No advances given." />
    </>
  );
}
