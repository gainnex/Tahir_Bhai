import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { parseInputDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { ProjectInput, ProjectStatus } from "@/lib/validation/projects";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { icontains } from "@/server/search";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { budgetUsage, COUNTABLE, spentByProject } from "./totals";

// ---- Access (business rule 4) ----

/** Projects the actor may see: everything for Admin/Accountant, assigned ones for Site In-charge. */
export function projectScope(actor: Actor): Prisma.ProjectWhereInput {
  if (can.seeAllProjects(actor.role)) return { deletedAt: null };
  return { deletedAt: null, users: { some: { userId: actor.id } } };
}

/** Ids of the projects a site in-charge is assigned to; null = all projects. */
export async function accessibleProjectIds(actor: Actor): Promise<number[] | null> {
  if (can.seeAllProjects(actor.role)) return null;
  const rows = await db.projectUser.findMany({
    where: { userId: actor.id, project: { deletedAt: null } },
    select: { projectId: true },
  });
  return rows.map((r) => r.projectId);
}

/** Throws NotFound for missing/deleted projects and Forbidden for unassigned ones. */
export async function assertProjectAccess(actor: Actor, projectId: number) {
  const project = await db.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!project) throw new NotFoundError("Project");
  if (!can.seeAllProjects(actor.role)) {
    const link = await db.projectUser.findUnique({
      where: { projectId_userId: { projectId, userId: actor.id } },
    });
    if (!link) throw new ForbiddenError("You are not assigned to this project.");
  }
  return project;
}

// ---- Queries ----

export type ProjectListFilters = { q?: string; status?: ProjectStatus };

export async function listProjects(actor: Actor, filters: ProjectListFilters = {}) {
  const q = filters.q?.trim();
  const projects = await db.project.findMany({
    where: {
      AND: [
        projectScope(actor),
        filters.status ? { status: filters.status } : {},
        q
          ? {
              OR: [
                { code: icontains(q) },
                { name: icontains(q) },
                { clientName: icontains(q) },
                { location: icontains(q) },
              ],
            }
          : {},
      ],
    },
    // Head Office first, then by code
    orderBy: [{ isHeadOffice: "desc" }, { code: "asc" }],
  });
  const spent = await spentByProject(projects.map((p) => p.id));
  return projects.map((p) => {
    const s = spent.get(p.id) ?? new Prisma.Decimal(0);
    return { ...p, spent: s, usage: budgetUsage(p.budget, s) };
  });
}

/** Project dropdown options. `forNewExpense` excludes COMPLETED projects (business rule 3). */
export async function listProjectOptions(actor: Actor, opts: { forNewExpense?: boolean } = {}) {
  return db.project.findMany({
    where: { ...projectScope(actor), ...(opts.forNewExpense ? { status: { not: "COMPLETED" } } : {}) },
    select: { id: true, code: true, name: true, status: true, isHeadOffice: true },
    orderBy: [{ isHeadOffice: "desc" }, { code: "asc" }],
  });
}

export async function getProjectForEdit(actor: Actor, id: number) {
  assertCan(actor, "manageProjects");
  const project = await db.project.findFirst({
    where: { id, deletedAt: null },
    include: { users: { select: { userId: true } } },
  });
  if (!project) throw new NotFoundError("Project");
  return project;
}

/** Everything the project profile page shows. */
export async function getProjectProfile(actor: Actor, id: number) {
  const project = await assertProjectAccess(actor, id);

  const [approved, pending, byHead, heads, latest, siteIncharges] = await Promise.all([
    db.expense.aggregate({ where: { ...COUNTABLE, projectId: id }, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({
      where: { status: "PENDING", deletedAt: null, projectId: id },
      _sum: { amount: true },
      _count: true,
    }),
    db.expense.groupBy({ by: ["headId"], where: { ...COUNTABLE, projectId: id }, _sum: { amount: true }, _count: true }),
    db.expenseHead.findMany({ select: { id: true, name: true, sortOrder: true } }),
    db.expense.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 10,
      include: { head: { select: { name: true } }, subhead: { select: { name: true } } },
    }),
    db.projectUser.findMany({ where: { projectId: id }, select: { user: { select: { id: true, name: true } } } }),
  ]);

  const spent = approved._sum.amount ?? new Prisma.Decimal(0);
  const headName = new Map(heads.map((h) => [h.id, h.name]));
  const spendByHead = byHead
    .map((r) => ({
      headId: r.headId,
      head: headName.get(r.headId) ?? "—",
      amount: r._sum.amount ?? new Prisma.Decimal(0),
      count: r._count,
    }))
    .sort((a, b) => b.amount.comparedTo(a.amount));

  return {
    project,
    spent,
    approvedCount: approved._count,
    pendingAmount: pending._sum.amount ?? new Prisma.Decimal(0),
    pendingCount: pending._count,
    usage: budgetUsage(project.budget, spent),
    spendByHead,
    latest,
    siteIncharges: siteIncharges.map((s) => s.user),
  };
}

/** Active site in-charge users, for the assignment checkboxes. */
export async function listSiteIncharges() {
  return db.user.findMany({
    where: { role: "SITE_INCHARGE", isActive: true },
    select: { id: true, name: true, username: true },
    orderBy: { name: "asc" },
  });
}

// ---- Mutations (Admin only) ----

async function validSiteInchargeIds(ids: number[]) {
  if (ids.length === 0) return [];
  const users = await db.user.findMany({
    where: { id: { in: ids }, role: "SITE_INCHARGE" },
    select: { id: true },
  });
  if (users.length !== new Set(ids).size) throw new AppError("Only Site In-charge users can be assigned to projects.");
  return users.map((u) => u.id);
}

function projectData(input: ProjectInput) {
  return {
    code: input.code,
    name: input.name,
    clientName: input.clientName,
    location: input.location,
    startDate: parseInputDate(input.startDate),
    endDate: input.endDate ? parseInputDate(input.endDate) : null,
    status: input.status,
    budget: input.budget ? new Prisma.Decimal(input.budget) : null,
    notes: input.notes,
  };
}

function codeTaken(e: unknown, code: string): never {
  if (isUniqueError(e, "code")) throw new AppError(`Project code "${code}" is already used.`);
  throw e;
}

export async function createProject(actor: Actor, input: ProjectInput) {
  assertCan(actor, "manageProjects");
  const userIds = await validSiteInchargeIds(input.siteInchargeIds);
  try {
    return await db.$transaction(async (tx) => {
      const project = await tx.project.create({ data: projectData(input) });
      if (userIds.length) {
        await tx.projectUser.createMany({ data: userIds.map((userId) => ({ projectId: project.id, userId })) });
      }
      await logActivity(
        {
          userId: actor.id,
          action: "CREATE",
          entityType: "project",
          entityId: project.id,
          changes: { ...snapshot(project), siteInchargeIds: userIds },
        },
        tx,
      );
      return project;
    });
  } catch (e) {
    codeTaken(e, input.code);
  }
}

export async function updateProject(actor: Actor, id: number, input: ProjectInput) {
  assertCan(actor, "manageProjects");
  const before = await db.project.findFirst({
    where: { id, deletedAt: null },
    include: { users: { select: { userId: true } } },
  });
  if (!before) throw new NotFoundError("Project");

  const data = projectData(input);
  if (before.isHeadOffice) {
    // The built-in cost center keeps its code and can never be closed.
    data.code = before.code;
    if (data.status === "COMPLETED") throw new AppError("Head Office / General cannot be marked Completed.");
  }
  const userIds = await validSiteInchargeIds(input.siteInchargeIds);
  const oldIds = before.users.map((u) => u.userId).sort((a, b) => a - b);
  const newIds = [...userIds].sort((a, b) => a - b);

  try {
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data });
      await tx.projectUser.deleteMany({ where: { projectId: id, userId: { notIn: newIds } } });
      for (const userId of newIds.filter((u) => !oldIds.includes(u))) {
        await tx.projectUser.create({ data: { projectId: id, userId } });
      }
      const changes: Record<string, unknown> = diffChanges(before, data);
      if (JSON.stringify(oldIds) !== JSON.stringify(newIds)) {
        changes.siteInchargeIds = { old: oldIds, new: newIds };
      }
      if (Object.keys(changes).length) {
        await logActivity({ userId: actor.id, action: "UPDATE", entityType: "project", entityId: id, changes }, tx);
      }
    });
  } catch (e) {
    codeTaken(e, input.code);
  }
}

/**
 * Soft delete. Refused for Head Office and for projects that still have expenses —
 * otherwise those expenses would silently disappear from the reports.
 */
export async function deleteProject(actor: Actor, id: number) {
  assertCan(actor, "manageProjects");
  const project = await db.project.findFirst({ where: { id, deletedAt: null } });
  if (!project) throw new NotFoundError("Project");
  if (project.isHeadOffice) throw new AppError("Head Office / General cannot be deleted.");
  const expenses = await db.expense.count({ where: { projectId: id, deletedAt: null } });
  if (expenses > 0) {
    throw new AppError(
      `This project has ${expenses} expense(s). Delete or move them first, or mark the project Completed instead.`,
    );
  }
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "project", entityId: id, changes: snapshot(project) },
      tx,
    );
  });
}
