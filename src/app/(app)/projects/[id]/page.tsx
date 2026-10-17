import Link from "next/link";
import { BookOpen, CircleDollarSign, Clock, Pencil, Plus, Users, Wallet } from "lucide-react";
import { BudgetBar } from "@/components/budget-bar";
import { AmountBarChart } from "@/components/charts/amount-bar-chart";
import { ExpenseMiniTable } from "@/components/expense-mini-table";
import { Kpi } from "@/components/kpi";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { OverBudgetBadge, ProjectStatusBadge } from "@/components/status-badges";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAmount, formatDate, formatPKR, plural } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getProjectProfile } from "@/server/services/project-service";
import { getSettings } from "@/server/services/settings-service";

export const metadata = { title: "Project" };

const th = "px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
const num = "num px-3 font-mono text-[13px]";

export default async function ProjectProfilePage({ params }: PageProps<"/projects/[id]">) {
  const actor = await requireUser();
  const id = parseId((await params).id);
  const [p, settings] = await Promise.all([pageData(getProjectProfile(actor, id)), getSettings()]);
  const { project } = p;
  const cur = settings.currencyLabel;
  const locked = project.status === "COMPLETED";
  const over = p.usage?.level === "over";

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {project.name} <ProjectStatusBadge status={project.status} />
            {over && <OverBudgetBadge />}
          </span>
        }
        description={
          <>
            <span className="font-mono">{project.code}</span>
            {[project.clientName, project.location].filter(Boolean).map((t) => ` · ${t}`)}
            {" · Started "}
            <span className="font-mono tabular-nums">{formatDate(project.startDate)}</span>
            {project.endDate && (
              <>
                {" · Ends "}
                <span className="font-mono tabular-nums">{formatDate(project.endDate)}</span>
              </>
            )}
          </>
        }
        actions={
          <>
            {!locked && (
              <Link href={`/expenses/new?projectId=${project.id}`} className={buttonVariants()}>
                <Plus /> New expense
              </Link>
            )}
            <Link href={`/reports/project-ledger?projectId=${project.id}`} className={buttonVariants({ variant: "outline" })}>
              <BookOpen /> View ledger
            </Link>
            {can.manageProjects(actor.role) && (
              <Link href={`/projects/${project.id}/edit`} className={buttonVariants({ variant: "outline" })}>
                <Pencil /> Edit
              </Link>
            )}
          </>
        }
      />

      {locked && (
        <Notice variant="info" className="mb-4">
          This project is Completed and locked — no new expenses can be posted.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Total spent"
          icon={CircleDollarSign}
          value={formatPKR(p.spent, cur)}
          sub={plural(p.approvedCount, "approved expense")}
        />
        <Kpi
          label="Budget"
          icon={Wallet}
          value={project.budget ? formatPKR(project.budget, cur) : "—"}
          sub={!project.budget && "No budget set"}
        />
        <Kpi
          label="Remaining"
          tone={over ? "danger" : undefined}
          value={
            p.usage
              ? p.usage.remaining.startsWith("-")
                ? `${formatPKR(p.usage.remaining.slice(1), cur)} over`
                : formatPKR(p.usage.remaining, cur)
              : "—"
          }
          sub={p.usage && <BudgetBar usage={p.usage} />}
        />
        <Kpi
          label="Pending approval"
          icon={Clock}
          tone={p.pendingCount > 0 ? "warning" : undefined}
          value={formatPKR(p.pendingAmount, cur)}
          sub={`${plural(p.pendingCount, "expense")} — not counted in totals yet`}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spend by expense head</CardTitle>
            <CardDescription>Approved expenses only</CardDescription>
          </CardHeader>
          <CardContent>
            <AmountBarChart
              currency={cur}
              data={p.spendByHead.map((r) => ({ name: r.head, amount: r.amount.toFixed(2) }))}
            />
          </CardContent>
        </Card>
        <div className="self-start overflow-hidden rounded-lg border border-border/60 bg-card shadow-xs">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="hover:bg-transparent">
                <TableHead className={th}>Head</TableHead>
                <TableHead className={cn(th, "text-right")}>Entries</TableHead>
                <TableHead className={cn(th, "text-right")}>Amount ({cur})</TableHead>
                <TableHead className={cn(th, "text-right")}>Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.spendByHead.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No approved expenses yet.
                  </TableCell>
                </TableRow>
              )}
              {p.spendByHead.map((r) => (
                <TableRow key={r.headId}>
                  <TableCell className="px-3">{r.head}</TableCell>
                  <TableCell className={num}>{r.count}</TableCell>
                  <TableCell className={num}>{formatAmount(r.amount)}</TableCell>
                  <TableCell className={num}>
                    {p.spent.isZero() ? "—" : `${r.amount.div(p.spent).mul(100).toDecimalPlaces(1).toString()}%`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {p.spendByHead.length > 0 && (
              <TableFooter className="border-t-2 bg-muted/60 font-semibold">
                <TableRow className="hover:bg-transparent">
                  <TableCell className="px-3">Total</TableCell>
                  <TableCell className={num}>{p.approvedCount}</TableCell>
                  <TableCell className={num}>{formatAmount(p.spent)}</TableCell>
                  <TableCell className={num}>100%</TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Latest expenses</h2>
          <Link href={`/expenses?projectId=${project.id}`} className="text-sm text-primary hover:underline">
            All expenses for this project →
          </Link>
        </div>
        <ExpenseMiniTable
          rows={p.latest.map((e) => ({ ...e, project: { code: project.code, name: project.name } }))}
          currency={cur}
          showProject={false}
          showPaidTo
        />
      </div>

      {(p.siteIncharges.length > 0 || project.notes) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {p.siteIncharges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-muted-foreground" /> Site In-charges
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {p.siteIncharges.map((u) => u.name).join(", ")}
              </CardContent>
            </Card>
          )}
          {project.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Notes</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-line text-muted-foreground">{project.notes}</CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
