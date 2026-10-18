import type { LogAction, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseInputDate } from "@/lib/format";
import { assertCan, type Actor } from "@/server/guards";

// Activity log viewer (docs/FEATURES.md §10). Writing happens in activity-log.ts.

export const LOG_ACTIONS: LogAction[] = ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "LOGIN"];
export const ENTITY_TYPES = [
  "expense",
  "project",
  "vendor",
  "worker",
  "cash_entry",
  "attendance",
  "pay_adjustment",
  "user",
  "expense_head",
  "expense_subhead",
  "settings",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type ActivityFilters = {
  userId?: number;
  action?: LogAction;
  entityType?: EntityType;
  entityId?: number;
  from?: string; // YYYY-MM-DD
  to?: string;
  page?: number;
};

export const ACTIVITY_PAGE_SIZE = 50;

/** Map of field -> id -> display name, so logged ids read as names. */
export type NameMaps = Record<string, Record<number, string>>;

const ID_FIELDS = [
  "projectId",
  "headId",
  "subheadId",
  "vendorId",
  "workerId",
  "paidFromId",
  "approvedById",
  "defaultProjectId",
  "siteInchargeIds",
  "userId",
];

function collectIds(changes: unknown, into: Record<string, Set<number>>) {
  if (!changes || typeof changes !== "object") return;
  for (const [key, value] of Object.entries(changes as Record<string, unknown>)) {
    if (!ID_FIELDS.includes(key)) continue;
    const add = (v: unknown) => {
      if (typeof v === "number") (into[key] ??= new Set()).add(v);
      if (Array.isArray(v)) v.forEach(add);
    };
    if (value && typeof value === "object" && "old" in value && "new" in value) {
      add((value as { old: unknown }).old);
      add((value as { new: unknown }).new);
    } else add(value);
  }
}

async function resolveNames(ids: Record<string, Set<number>>): Promise<NameMaps> {
  const list = (k: string) => [...(ids[k] ?? [])];
  const projectIds = [...list("projectId"), ...list("defaultProjectId")];
  const userIds = [...list("approvedById"), ...list("siteInchargeIds"), ...list("userId")];
  const workerIds = [...list("workerId"), ...list("paidFromId")];
  const [projects, heads, subheads, vendors, workers, users] = await Promise.all([
    projectIds.length ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, code: true, name: true } }) : [],
    list("headId").length ? db.expenseHead.findMany({ where: { id: { in: list("headId") } }, select: { id: true, name: true } }) : [],
    list("subheadId").length ? db.expenseSubhead.findMany({ where: { id: { in: list("subheadId") } }, select: { id: true, name: true } }) : [],
    list("vendorId").length ? db.vendor.findMany({ where: { id: { in: list("vendorId") } }, select: { id: true, name: true } }) : [],
    workerIds.length ? db.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true } }) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
  ]);
  const toMap = (rows: { id: number; name: string; code?: string }[]) =>
    Object.fromEntries(rows.map((r) => [r.id, r.code ? `${r.code} ${r.name}` : r.name]));
  const projectMap = toMap(projects);
  const userMap = toMap(users);
  return {
    projectId: projectMap,
    defaultProjectId: projectMap,
    headId: toMap(heads),
    subheadId: toMap(subheads),
    vendorId: toMap(vendors),
    workerId: toMap(workers),
    paidFromId: toMap(workers),
    approvedById: userMap,
    userId: userMap,
    siteInchargeIds: userMap,
  };
}

/** Names for every id mentioned in a set of log `changes` values. */
export async function namesForChanges(changesList: unknown[]): Promise<NameMaps> {
  const ids: Record<string, Set<number>> = {};
  changesList.forEach((c) => collectIds(c, ids));
  return resolveNames(ids);
}

export async function listActivity(actor: Actor, f: ActivityFilters) {
  assertCan(actor, "manageSettings");
  const and: Prisma.ActivityLogWhereInput[] = [];
  if (f.userId) and.push({ userId: f.userId });
  if (f.action) and.push({ action: f.action });
  if (f.entityType) and.push({ entityType: f.entityType });
  if (f.entityId) and.push({ entityId: f.entityId });
  if (f.from) and.push({ createdAt: { gte: new Date(parseInputDate(f.from).getTime() - 5 * 3600_000) } }); // PKT day start
  if (f.to) and.push({ createdAt: { lt: new Date(parseInputDate(f.to).getTime() + 19 * 3600_000) } }); // PKT day end
  const where: Prisma.ActivityLogWhereInput = { AND: and };
  const page = Math.max(1, f.page ?? 1);

  const [rows, count] = await Promise.all([
    db.activityLog.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      take: ACTIVITY_PAGE_SIZE,
      include: { user: { select: { id: true, name: true, username: true } } },
    }),
    db.activityLog.count({ where }),
  ]);

  // Human labels for the records the rows point at (expense numbers, project codes, …)
  const idsOf = (type: string) => [...new Set(rows.filter((r) => r.entityType === type).map((r) => r.entityId))];
  const [expenses, projects, vendors, workers, users, heads, subheads, cashEntries, adjustments] = await Promise.all([
    db.expense.findMany({ where: { id: { in: idsOf("expense") } }, select: { id: true, expenseNo: true } }),
    db.project.findMany({ where: { id: { in: idsOf("project") } }, select: { id: true, code: true } }),
    db.vendor.findMany({ where: { id: { in: idsOf("vendor") } }, select: { id: true, name: true } }),
    // attendance is logged against the employee
    db.worker.findMany({ where: { id: { in: [...idsOf("worker"), ...idsOf("attendance")] } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: idsOf("user") } }, select: { id: true, username: true } }),
    db.expenseHead.findMany({ where: { id: { in: idsOf("expense_head") } }, select: { id: true, name: true } }),
    db.expenseSubhead.findMany({ where: { id: { in: idsOf("expense_subhead") } }, select: { id: true, name: true } }),
    db.cashEntry.findMany({ where: { id: { in: idsOf("cash_entry") } }, select: { id: true, entryNo: true } }),
    db.payAdjustment.findMany({ where: { id: { in: idsOf("pay_adjustment") } }, select: { id: true, entryNo: true } }),
  ]);
  const workerNames = Object.fromEntries(workers.map((w) => [w.id, w.name]));
  const labels: Record<string, Record<number, string>> = {
    expense: Object.fromEntries(expenses.map((e) => [e.id, e.expenseNo])),
    project: Object.fromEntries(projects.map((p) => [p.id, p.code])),
    vendor: Object.fromEntries(vendors.map((v) => [v.id, v.name])),
    worker: workerNames,
    attendance: workerNames,
    user: Object.fromEntries(users.map((u) => [u.id, `@${u.username}`])),
    expense_head: Object.fromEntries(heads.map((h) => [h.id, h.name])),
    expense_subhead: Object.fromEntries(subheads.map((s) => [s.id, s.name])),
    cash_entry: Object.fromEntries(cashEntries.map((c) => [c.id, c.entryNo])),
    pay_adjustment: Object.fromEntries(adjustments.map((a) => [a.id, a.entryNo])),
  };

  const names = await namesForChanges(rows.map((r) => r.changes));

  return {
    rows: rows.map((r) => ({ ...r, entityLabel: labels[r.entityType]?.[r.entityId] ?? null })),
    names,
    count,
    page,
    pages: Math.max(1, Math.ceil(count / ACTIVITY_PAGE_SIZE)),
  };
}

/** Link to the record a log row is about (null when there is no page for it). */
export function entityHref(entityType: string, entityId: number): string | null {
  switch (entityType) {
    case "expense":
      return `/expenses/${entityId}`;
    case "project":
      return `/projects/${entityId}`;
    case "vendor":
      return `/vendors/${entityId}`;
    case "worker":
    case "attendance":
      return `/workers/${entityId}`;
    case "pay_adjustment":
      return `/payroll/adjustments/${entityId}/edit`;
    case "cash_entry":
      return `/cash/entry/${entityId}/edit`;
    case "user":
      return `/settings/users/${entityId}`;
    case "expense_head":
    case "expense_subhead":
      return "/settings/heads";
    case "settings":
      return "/settings/company";
    default:
      return null;
  }
}
