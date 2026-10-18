import Link from "next/link";
import { ArrowRight, CalendarDays, CalendarRange, Clock, PiggyBank, Plus, TriangleAlert } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { AmountBarChart } from "@/components/charts/amount-bar-chart";
import { ExpenseMiniTable } from "@/components/expense-mini-table";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { OverBudgetBadge, ProjectStatusBadge } from "@/components/status-badges";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatPKR, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { totalCashWithEmployees } from "@/server/services/cash-service";
import { getDashboard, type DashboardPeriod } from "@/server/services/dashboard-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata = { title: "Dashboard" };

const PERIODS: { key: DashboardPeriod; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
];

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const actor = await requireUser();
  const sp = await searchParams;
  const period = (PERIODS.find((p) => p.key === sp.period)?.key ?? "year") as DashboardPeriod;
  const showCash = can.manageCash(actor.role);
  const [d, settings, cash] = await Promise.all([
    getDashboard(actor, period),
    getSettings(),
    showCash ? totalCashWithEmployees() : null,
  ]);
  const cur = settings.currencyLabel;
  const periodLabel = PERIODS.find((p) => p.key === period)!.label.toLowerCase();
  const pendingHref = can.approveExpenses(actor.role) ? "/expenses/pending" : "/expenses?status=PENDING";

  const projectChart = d.byProject.map((r) => ({ name: r.project.code, amount: r.amount.toFixed(2) }));
  if (d.otherProjectsCount > 0) {
    projectChart.push({ name: `${d.otherProjectsCount} others`, amount: d.otherProjectsTotal.toFixed(2) });
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={d.limitedToAssigned ? `Welcome, ${actor.name} — showing your assigned projects` : `Welcome, ${actor.name}`}
        actions={
          <Link href="/expenses/new" className={buttonVariants()}>
            <Plus /> New expense
          </Link>
        }
      />
      {sp.passwordChanged && (
        <Notice variant="success" className="mb-4">
          Your password has been changed.
        </Notice>
      )}

      <div className={cn("grid gap-4 sm:grid-cols-3", cash && "sm:grid-cols-2 lg:grid-cols-4")}>
        <Kpi
          label="Spent"
          period="This month"
          icon={CalendarDays}
          value={formatPKR(d.monthTotal, cur)}
          sub={`${plural(d.monthCount, "approved expense")} · last month ${formatPKR(d.lastMonthTotal, cur)}`}
        />
        <Kpi
          label="Spent"
          period="This year"
          icon={CalendarRange}
          value={formatPKR(d.yearTotal, cur)}
          sub={plural(d.yearCount, "approved expense")}
        />
        <Link
          href={pendingHref}
          className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Kpi
            label="Pending approval"
            icon={Clock}
            tone={d.pendingCount > 0 ? "warning" : undefined}
            value={
              <span className="flex items-center gap-2">
                {d.pendingCount}
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
              </span>
            }
            sub={`${formatPKR(d.pendingAmount, cur)} waiting — not in totals yet`}
          />
        </Link>
        {cash && (
          <Link
            href="/cash"
            className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Kpi
              label="Cash with employees"
              icon={PiggyBank}
              value={
                <span className="flex items-center gap-2">
                  {formatPKR(cash.held, cur)}
                  <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
                </span>
              }
              sub={
                cash.owedCount
                  ? `${formatPKR(cash.owed, cur)} owed to ${plural(cash.owedCount, "employee")}`
                  : `Held by ${plural(cash.heldCount, "employee")}`
              }
            />
          </Link>
        )}
      </div>

      {d.budgetAlerts.length > 0 && (
        <Card className="mt-6 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TriangleAlert className="size-4 text-amber-600" /> Budget alerts
            </CardTitle>
            <CardDescription>Projects at 80 % of their budget or more.</CardDescription>
            <CardAction>
              <Badge variant="warning" className="font-mono tabular-nums">
                {d.budgetAlerts.length}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {d.budgetAlerts.map(({ project, usage }) => (
                <li key={project.id} className="grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_14rem_13rem] sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/projects/${project.id}`} className="font-medium text-primary hover:underline">
                      <span className="font-mono">{project.code}</span> — {project.name}
                    </Link>
                    <ProjectStatusBadge status={project.status} />
                    {usage.level === "over" && <OverBudgetBadge />}
                  </div>
                  <BudgetBar usage={usage} />
                  <div className="font-mono text-sm tabular-nums sm:text-right">
                    {formatPKR(usage.spent, cur)} <span className="text-muted-foreground">of {formatAmount(usage.budget)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Charts for:</span>
        {/* Tabs look, but each period is a URL so the view can be bookmarked */}
        <nav aria-label="Chart period" className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "year" ? "/" : `/?period=${p.key}`}
              aria-current={p.key === period ? "page" : undefined}
              className={cn(
                "inline-flex h-full items-center rounded-md px-3 text-sm font-medium transition-colors hover:text-foreground",
                p.key === period && "bg-background text-foreground shadow-sm",
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        <span className="ml-auto text-sm">
          Total {periodLabel}: <span className="font-mono font-semibold tabular-nums">{formatPKR(d.periodTotal, cur)}</span>
        </span>
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend by project</CardTitle>
            <CardDescription>Approved expenses, {periodLabel}</CardDescription>
            {d.byProject.length >= 10 && (
              <CardAction>
                <Badge variant="outline" className="font-normal text-muted-foreground">
                  Top 10
                </Badge>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <AmountBarChart data={projectChart} currency={cur} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spend by expense head</CardTitle>
            <CardDescription>Approved expenses, {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AmountBarChart data={d.byHead.map((r) => ({ name: r.head, amount: r.amount.toFixed(2) }))} currency={cur} />
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Spend by client</CardTitle>
            <CardDescription>Approved expenses, {periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            <AmountBarChart data={d.byClient.map((r) => ({ name: r.client, amount: r.amount.toFixed(2) }))} currency={cur} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Latest entries</h2>
        <Link href="/expenses" className="text-sm text-primary hover:underline">
          All expenses →
        </Link>
      </div>
      <ExpenseMiniTable rows={d.latest} currency={cur} showPaidTo />
    </>
  );
}
