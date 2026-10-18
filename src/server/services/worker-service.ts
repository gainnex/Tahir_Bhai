import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { AppError, NotFoundError } from "@/lib/errors";
import type { EmployeeType, Trade, WorkerInput } from "@/lib/validation/parties";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { icontains } from "@/server/search";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { accessibleProjectIds } from "./project-service";
import { COUNTABLE } from "./totals";
import { expenseRowInclude } from "./vendor-service";

// Labour register (docs/FEATURES.md §5). Everyone can view workers (site in-charges record
// labour payments); only Admin/Accountant can add or edit them. Payment amounts shown to a
// site in-charge only include their assigned projects.

const ZERO = new Prisma.Decimal(0);

/** Expenses with sub-head "Advance to labour" under the Labour head are advances. */
export const ADVANCE_FILTER: Prisma.ExpenseWhereInput = {
  subhead: { name: ADVANCE_SUBHEAD, head: { name: LABOUR_HEAD } },
};

async function projectFilter(actor: Actor): Promise<Prisma.ExpenseWhereInput> {
  const ids = await accessibleProjectIds(actor);
  return ids ? { projectId: { in: ids } } : {};
}

export type WorkerFilters = {
  q?: string;
  trade?: Trade;
  employeeType?: EmployeeType;
  active?: "active" | "inactive" | "all";
};

export async function listWorkers(actor: Actor, filters: WorkerFilters = {}) {
  const q = filters.q?.trim();
  const active = filters.active ?? "active";
  const workers = await db.worker.findMany({
    where: {
      deletedAt: null,
      ...(filters.trade ? { trade: filters.trade } : {}),
      ...(filters.employeeType ? { employeeType: filters.employeeType } : {}),
      ...(active === "all" ? {} : { isActive: active === "active" }),
      ...(q ? { OR: [{ name: icontains(q) }, { cnic: icontains(q) }, { phone: icontains(q) }] } : {}),
    },
    include: { defaultProject: { select: { id: true, code: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const totals = await db.expense.groupBy({
    by: ["workerId"],
    where: { ...COUNTABLE, ...(await projectFilter(actor)), workerId: { in: workers.map((w) => w.id) } },
    _sum: { amount: true },
  });
  const byId = new Map(totals.map((t) => [t.workerId, t._sum.amount ?? ZERO]));
  return workers.map((w) => ({ ...w, totalPaid: byId.get(w.id) ?? ZERO }));
}

export async function getWorkerProfile(actor: Actor, id: number, opts: { projectId?: number } = {}) {
  const worker = await db.worker.findFirst({
    where: { id, deletedAt: null },
    include: {
      defaultProject: { select: { id: true, code: true, name: true } },
      user: { select: { id: true, username: true } },
    },
  });
  if (!worker) throw new NotFoundError("Worker");

  const scope = await projectFilter(actor);
  const base: Prisma.ExpenseWhereInput = {
    workerId: id,
    deletedAt: null,
    AND: [scope, opts.projectId ? { projectId: opts.projectId } : {}],
  };
  const approved: Prisma.ExpenseWhereInput = { ...base, status: "APPROVED" };

  const [total, advances, byProject, payments, advanceRows, pending, projects] = await Promise.all([
    db.expense.aggregate({ where: approved, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({ where: { ...approved, ...ADVANCE_FILTER }, _sum: { amount: true }, _count: true }),
    db.expense.groupBy({ by: ["projectId"], where: approved, _sum: { amount: true }, _count: true }),
    db.expense.findMany({
      where: { ...base, NOT: ADVANCE_FILTER },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 100,
      include: expenseRowInclude,
    }),
    db.expense.findMany({
      where: { ...base, ...ADVANCE_FILTER },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: expenseRowInclude,
    }),
    db.expense.aggregate({ where: { ...base, status: "PENDING" }, _sum: { amount: true }, _count: true }),
    // Projects this worker has payments on (for the filter + by-project table)
    db.expense
      .findMany({ where: { workerId: id, deletedAt: null, AND: [scope] }, distinct: ["projectId"], select: { project: { select: { id: true, code: true, name: true } } } })
      .then((rows) => rows.map((r) => r.project)),
  ]);

  // Advances per project, so the by-project table can show wages vs advances.
  const advByProject = await db.expense.groupBy({
    by: ["projectId"],
    where: { ...approved, ...ADVANCE_FILTER },
    _sum: { amount: true },
  });
  const advMap = new Map(advByProject.map((r) => [r.projectId, r._sum.amount ?? ZERO]));
  const projName = new Map(projects.map((p) => [p.id, p]));

  const totalPaid = total._sum.amount ?? ZERO;
  const advanceTotal = advances._sum.amount ?? ZERO;
  return {
    worker,
    totalPaid,
    paymentCount: total._count,
    advanceTotal,
    advanceCount: advances._count,
    wagesPaid: totalPaid.minus(advanceTotal),
    pendingAmount: pending._sum.amount ?? ZERO,
    pendingCount: pending._count,
    byProject: byProject
      .map((r) => {
        const all = r._sum.amount ?? ZERO;
        const adv = advMap.get(r.projectId) ?? ZERO;
        return { project: projName.get(r.projectId)!, total: all, advances: adv, wages: all.minus(adv), count: r._count };
      })
      .filter((r) => r.project)
      .sort((a, b) => b.total.comparedTo(a.total)),
    payments,
    advances: advanceRows,
    projects: projects.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

export async function getWorkerForEdit(actor: Actor, id: number) {
  assertCan(actor, "manageWorkers");
  const worker = await db.worker.findFirst({ where: { id, deletedAt: null } });
  if (!worker) throw new NotFoundError("Worker");
  return worker;
}

/** Active workers for the labour payment form (rate fills the days × rate helper). */
export async function listWorkerOptions() {
  const rows = await db.worker.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true, trade: true, rateType: true, rate: true, defaultProjectId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((w) => ({ ...w, rate: w.rate.toFixed(2) }));
}

/** Login accounts that can be linked to an employee (not already linked to someone else). */
export async function listLinkableUsers(workerId?: number) {
  return db.user.findMany({
    where: { OR: [{ employee: null }, ...(workerId ? [{ employee: { id: workerId } }] : [])] },
    select: { id: true, name: true, username: true, isActive: true },
    orderBy: { name: "asc" },
  });
}

async function workerData(input: WorkerInput, workerId?: number) {
  if (input.defaultProjectId) {
    const p = await db.project.findFirst({ where: { id: input.defaultProjectId, deletedAt: null } });
    if (!p) throw new AppError("The selected default project does not exist.");
  }
  if (input.userId) {
    const u = await db.user.findUnique({ where: { id: input.userId }, include: { employee: { select: { id: true, name: true } } } });
    if (!u) throw new AppError("The selected login account does not exist.");
    if (u.employee && u.employee.id !== workerId) {
      throw new AppError(`The login "${u.username}" is already linked to ${u.employee.name}.`);
    }
  }
  return {
    name: input.name,
    cnic: input.cnic,
    phone: input.phone,
    employeeType: input.employeeType,
    designation: input.designation,
    userId: input.userId,
    trade: input.trade,
    rateType: input.rateType,
    rate: new Prisma.Decimal(input.rate),
    defaultProjectId: input.defaultProjectId,
    isActive: input.isActive,
  };
}

export async function createWorker(actor: Actor, input: WorkerInput) {
  assertCan(actor, "manageWorkers");
  const data = await workerData(input);
  return db
    .$transaction(async (tx) => {
      const worker = await tx.worker.create({ data });
      await logActivity(
        { userId: actor.id, action: "CREATE", entityType: "worker", entityId: worker.id, changes: snapshot(worker) },
        tx,
      );
      return worker;
    })
    .catch(rethrowLinkedUser);
}

export async function updateWorker(actor: Actor, id: number, input: WorkerInput) {
  assertCan(actor, "manageWorkers");
  const before = await db.worker.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("Worker");
  const data = await workerData(input, id);
  await db
    .$transaction(async (tx) => {
      await tx.worker.update({ where: { id }, data });
      const changes = diffChanges(before, data);
      if (Object.keys(changes).length) {
        await logActivity({ userId: actor.id, action: "UPDATE", entityType: "worker", entityId: id, changes }, tx);
      }
    })
    .catch(rethrowLinkedUser);
}

/** Two admins linking the same login at the same moment hit the unique index. */
function rethrowLinkedUser(e: unknown): never {
  if (isUniqueError(e, "user")) throw new AppError("That login account is already linked to another employee.");
  throw e;
}

/** Soft delete; refused once the worker has payments (mark inactive instead). */
export async function deleteWorker(actor: Actor, id: number) {
  assertCan(actor, "manageWorkers");
  const worker = await db.worker.findFirst({ where: { id, deletedAt: null } });
  if (!worker) throw new NotFoundError("Worker");
  const [used, cash] = await Promise.all([
    db.expense.count({ where: { deletedAt: null, OR: [{ workerId: id }, { paidFromId: id }] } }),
    db.cashEntry.count({ where: { workerId: id, deletedAt: null } }),
  ]);
  if (used + cash > 0) {
    throw new AppError(
      `This employee has ${used + cash} payment(s) or cash entries and cannot be deleted. Mark them inactive instead.`,
    );
  }
  await db.$transaction(async (tx) => {
    await tx.worker.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "worker", entityId: id, changes: snapshot(worker) },
      tx,
    );
  });
}
