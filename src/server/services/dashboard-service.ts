import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseInputDate, todayPK } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Actor } from "@/server/guards";
import { expenseScope } from "./expense-service";
import { accessibleProjectIds } from "./project-service";
import { budgetUsage, COUNTABLE } from "./totals";

// Dashboard (docs/FEATURES.md §8). Site In-charges get the same view limited to their projects.

const ZERO = new Prisma.Decimal(0);

export type DashboardPeriod = "month" | "year" | "all";

/** [start, end) date range in Pakistan time for "this month" / "this year". */
export function periodRange(period: DashboardPeriod, today = todayPK()) {
  const [y, m] = today.split("-").map(Number);
  if (period === "month") {
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { gte: parseInputDate(`${y}-${String(m).padStart(2, "0")}-01`), lt: parseInputDate(next) };
  }
  if (period === "year") return { gte: parseInputDate(`${y}-01-01`), lt: parseInputDate(`${y + 1}-01-01`) };
  return undefined;
}

function lastMonthRange(today = todayPK()) {
  const [y, m] = today.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return {
    gte: parseInputDate(`${py}-${String(pm).padStart(2, "0")}-01`),
    lt: parseInputDate(`${y}-${String(m).padStart(2, "0")}-01`),
  };
}

export async function getDashboard(actor: Actor, period: DashboardPeriod = "year") {
  const scope = expenseScope(actor);
  const approved: Prisma.ExpenseWhereInput = { AND: [scope, COUNTABLE] };
  const range = periodRange(period);
  const inPeriod: Prisma.ExpenseWhereInput = { AND: [approved, range ? { date: range } : {}] };
  const sum = (where: Prisma.ExpenseWhereInput) =>
    db.expense.aggregate({ where, _sum: { amount: true }, _count: true });

  const projectIds = await accessibleProjectIds(actor);

  const [month, lastMonth, year, pending, byProjectRows, byHeadRows, latest, budgeted] = await Promise.all([
    sum({ AND: [approved, { date: periodRange("month") }] }),
    sum({ AND: [approved, { date: lastMonthRange() }] }),
    sum({ AND: [approved, { date: periodRange("year") }] }),
    sum({ AND: [scope, { status: "PENDING" }] }),
    db.expense.groupBy({ by: ["projectId"], where: inPeriod, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["headId"], where: inPeriod, _sum: { amount: true } }),
    db.expense.findMany({
      where: scope,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      include: {
        project: { select: { id: true, code: true, name: true } },
        head: { select: { name: true } },
        subhead: { select: { name: true } },
      },
    }),
    db.project.findMany({
      where: {
        deletedAt: null,
        budget: { not: null },
        ...(projectIds ? { id: { in: projectIds } } : {}),
      },
      select: { id: true, code: true, name: true, status: true, budget: true },
    }),
  ]);

  // Names for the chart rows
  const [projects, heads] = await Promise.all([
    db.project.findMany({
      where: { id: { in: byProjectRows.map((r) => r.projectId) } },
      select: { id: true, code: true, name: true },
    }),
    db.expenseHead.findMany({ where: { id: { in: byHeadRows.map((r) => r.headId) } }, select: { id: true, name: true } }),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const headName = new Map(heads.map((h) => [h.id, h.name]));

  const byProjectAll = byProjectRows
    .map((r) => ({ project: projectById.get(r.projectId)!, amount: r._sum.amount ?? ZERO }))
    .filter((r) => r.project)
    .sort((a, b) => b.amount.comparedTo(a.amount));
  const top = byProjectAll.slice(0, 10);
  const rest = byProjectAll.slice(10).reduce((s, r) => s.plus(r.amount), ZERO);

  const byHead = byHeadRows
    .map((r) => ({ head: headName.get(r.headId) ?? "—", amount: r._sum.amount ?? ZERO }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  // Budget alerts use all-time approved spend (budgets are for the whole project)
  const spentRows = budgeted.length
    ? await db.expense.groupBy({
        by: ["projectId"],
        where: { ...COUNTABLE, projectId: { in: budgeted.map((p) => p.id) } },
        _sum: { amount: true },
      })
    : [];
  const spentMap = new Map(spentRows.map((r) => [r.projectId, r._sum.amount ?? ZERO]));
  const budgetAlerts = budgeted
    .map((p) => ({ project: p, usage: budgetUsage(p.budget, spentMap.get(p.id) ?? ZERO)! }))
    .filter((r) => r.usage && r.usage.percentUsed >= 80)
    .sort((a, b) => b.usage.percentUsed - a.usage.percentUsed);

  return {
    period,
    monthTotal: month._sum.amount ?? ZERO,
    monthCount: month._count,
    lastMonthTotal: lastMonth._sum.amount ?? ZERO,
    yearTotal: year._sum.amount ?? ZERO,
    yearCount: year._count,
    pendingCount: pending._count,
    pendingAmount: pending._sum.amount ?? ZERO,
    byProject: top,
    otherProjectsTotal: rest,
    otherProjectsCount: Math.max(0, byProjectAll.length - 10),
    periodTotal: byProjectAll.reduce((s, r) => s.plus(r.amount), ZERO),
    byHead,
    budgetAlerts,
    latest,
    limitedToAssigned: !can.seeAllProjects(actor.role),
  };
}
