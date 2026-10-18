import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LABOUR_HEAD } from "@/lib/defaults";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { canApproveExpense, canDeleteExpense, canEditExpense, initialStatus } from "@/lib/expense-rules";
import { parseInputDate } from "@/lib/format";
import { apportionMoney, toPaisa } from "@/lib/money";
import { can } from "@/lib/permissions";
import {
  MAX_ATTACHMENTS,
  type ExpenseFilters,
  type ExpenseInput,
  type SplitExpenseInput,
} from "@/lib/validation/expenses";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { icontains } from "@/server/search";
import { RECEIPT_TYPES, saveUpload, type StoredFile } from "@/server/storage";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { assertProjectAccess } from "./project-service";
import { getSettings } from "./settings-service";

// Expenses — the core module. All business rules (README "KEY BUSINESS RULES" 1–9) are
// enforced here, never only in the UI.

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Visibility (rule 4)
// ---------------------------------------------------------------------------

/** Expenses the actor may see: all for Admin/Accountant, assigned projects for Site In-charge. */
export function expenseScope(actor: Actor): Prisma.ExpenseWhereInput {
  if (can.seeAllProjects(actor.role)) return { deletedAt: null };
  return { deletedAt: null, project: { deletedAt: null, users: { some: { userId: actor.id } } } };
}

async function loadExpense(actor: Actor, id: number) {
  const expense = await db.expense.findFirst({ where: { id, deletedAt: null }, include: { attachments: true } });
  if (!expense) throw new NotFoundError("Expense");
  await assertProjectAccess(actor, expense.projectId);
  return expense;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

function filterWhere(actor: Actor, f: Partial<ExpenseFilters>): Prisma.ExpenseWhereInput {
  const and: Prisma.ExpenseWhereInput[] = [expenseScope(actor)];
  if (f.from) and.push({ date: { gte: parseInputDate(f.from) } });
  if (f.to) and.push({ date: { lte: parseInputDate(f.to) } });
  if (f.projectId) and.push({ projectId: f.projectId });
  if (f.client) and.push({ project: { clientName: f.client } });
  if (f.headId) and.push({ headId: f.headId });
  if (f.subheadId) and.push({ subheadId: f.subheadId });
  if (f.vendorId) and.push({ vendorId: f.vendorId });
  if (f.workerId) and.push({ workerId: f.workerId });
  if (f.paidFromId) and.push({ paidFromId: f.paidFromId });
  if (f.createdById) and.push({ createdById: f.createdById });
  if (f.status) and.push({ status: f.status });
  if (f.paymentMode) and.push({ paymentMode: f.paymentMode });
  if (f.minAmount) and.push({ amount: { gte: new Prisma.Decimal(f.minAmount) } });
  if (f.maxAmount) and.push({ amount: { lte: new Prisma.Decimal(f.maxAmount) } });
  if (f.q) {
    and.push({
      OR: [
        { paidTo: icontains(f.q) },
        { description: icontains(f.q) },
        { expenseNo: icontains(f.q) },
        { referenceNo: icontains(f.q) },
        { chequeNo: icontains(f.q) },
      ],
    });
  }
  return { AND: and };
}

export const EXPENSE_PAGE_SIZE = 50;

/** Filtered list + the total of all filtered rows (and the approved part of it). */
export async function listExpenses(actor: Actor, filters: Partial<ExpenseFilters>, pageSize = EXPENSE_PAGE_SIZE) {
  const where = filterWhere(actor, filters);
  const page = filters.page ?? 1;
  // Optional column sort from the list header; ties (and the default) stay newest first
  const sortKey = filters.sort?.replace(/^-/, "") as "date" | "expenseNo" | "amount" | "paidTo" | undefined;
  const orderBy: Prisma.ExpenseOrderByWithRelationInput[] = [
    ...(sortKey && sortKey !== "date" ? [{ [sortKey]: filters.sort!.startsWith("-") ? "desc" : "asc" }] : []),
    { date: filters.sort === "date" ? "asc" : "desc" },
    { id: filters.sort === "date" ? "asc" : "desc" },
  ];
  const [rows, byStatus] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        project: { select: { id: true, code: true, name: true } },
        head: { select: { name: true } },
        subhead: { select: { name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { attachments: true } },
      },
    }),
    db.expense.groupBy({ by: ["status"], where, _sum: { amount: true }, _count: true }),
  ]);
  const count = byStatus.reduce((n, r) => n + r._count, 0);
  const total = byStatus.reduce((s, r) => s.plus(r._sum.amount ?? ZERO), ZERO);
  const approved = byStatus.find((r) => r.status === "APPROVED");
  return {
    rows,
    count,
    total,
    approvedTotal: approved?._sum.amount ?? ZERO,
    approvedCount: approved?._count ?? 0,
    page,
    pages: Math.max(1, Math.ceil(count / pageSize)),
  };
}

export async function getExpenseDetail(actor: Actor, id: number) {
  const expense = await db.expense.findFirst({
    where: { id, deletedAt: null },
    include: {
      project: { select: { id: true, code: true, name: true, status: true } },
      head: { select: { id: true, name: true } },
      subhead: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      worker: { select: { id: true, name: true } },
      paidFrom: { select: { id: true, name: true, userId: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      attachments: { orderBy: { id: "asc" } },
    },
  });
  if (!expense) throw new NotFoundError("Expense");
  await assertProjectAccess(actor, expense.projectId);

  const [splitLines, history] = await Promise.all([
    expense.splitGroupId
      ? db.expense.findMany({
          where: { splitGroupId: expense.splitGroupId, deletedAt: null },
          orderBy: { id: "asc" },
          include: {
            project: { select: { code: true, name: true } },
            head: { select: { name: true } },
            subhead: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    db.activityLog.findMany({
      where: { entityType: "expense", entityId: id },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true } } },
    }),
  ]);
  return { expense, splitLines, history };
}

export async function listPendingApprovals(actor: Actor) {
  assertCan(actor, "approveExpenses");
  return db.expense.findMany({
    where: { status: "PENDING", deletedAt: null, project: { deletedAt: null } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    include: {
      project: { select: { code: true, name: true } },
      head: { select: { name: true } },
      subhead: { select: { name: true } },
      createdBy: { select: { name: true } },
      attachments: { select: { id: true, fileName: true, mimeType: true }, orderBy: { id: "asc" } },
    },
  });
}

/** Attachment for download — only if the actor can see its expense. */
export async function getAttachment(actor: Actor, attachmentId: number) {
  const att = await db.attachment.findUnique({ where: { id: attachmentId }, include: { expense: true } });
  if (!att || att.expense.deletedAt) throw new NotFoundError("File");
  await assertProjectAccess(actor, att.expense.projectId);
  return att;
}

/**
 * Dropdown data for the expense form. New entries only get usable choices (active
 * heads/sub-heads, non-completed projects); when editing, the record's current values are
 * included even if they have since been disabled/completed so the form can show them.
 */
export async function getExpenseFormOptions(
  actor: Actor,
  current?: { projectId: number; headId: number; subheadId: number; workerId: number | null; paidFromId?: number | null },
) {
  const [projects, heads, vendors, workers, cashHolders, ownEmployee] = await Promise.all([
    db.project.findMany({
      where: {
        AND: [
          can.seeAllProjects(actor.role) ? { deletedAt: null } : { deletedAt: null, users: { some: { userId: actor.id } } },
          { OR: [{ status: { not: "COMPLETED" } }, ...(current ? [{ id: current.projectId }] : [])] },
        ],
      },
      select: { id: true, code: true, name: true, status: true },
      orderBy: [{ isHeadOffice: "desc" }, { code: "asc" }],
    }),
    db.expenseHead.findMany({
      where: { OR: [{ isActive: true }, ...(current ? [{ id: current.headId }] : [])] },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        isActive: true,
        subheads: {
          where: { OR: [{ isActive: true }, ...(current ? [{ id: current.subheadId }] : [])] },
          orderBy: { name: "asc" },
          select: { id: true, name: true, isActive: true },
        },
      },
    }),
    db.vendor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.worker.findMany({
      where: { deletedAt: null, OR: [{ isActive: true }, ...(current?.workerId ? [{ id: current.workerId }] : [])] },
      select: { id: true, name: true, rate: true, rateType: true, defaultProjectId: true },
      orderBy: { name: "asc" },
    }),
    cashHolderOptions(actor, current?.paidFromId ?? null),
    ownEmployeeId(actor.id),
  ]);
  return {
    projects,
    heads,
    vendors,
    workers: workers.map((w) => ({ ...w, rate: w.rate.toFixed(2) })),
    cashHolders,
    /** Pre-selected "paid from" for a new expense entered by an employee with a login */
    ownEmployeeId: ownEmployee,
  };
}

/** The employee record linked to a login, if any. */
export async function ownEmployeeId(userId: number) {
  const w = await db.worker.findFirst({ where: { userId, deletedAt: null }, select: { id: true } });
  return w?.id ?? null;
}

/**
 * Who an expense may be "paid from". Admin/Accountant: any active employee. Everyone else:
 * only their own linked employee record (they spend their own cash in hand).
 */
async function cashHolderOptions(actor: Actor, currentId: number | null) {
  const own = can.manageCash(actor.role) ? {} : { userId: actor.id };
  return db.worker.findMany({
    where: { deletedAt: null, OR: [{ isActive: true, ...own }, ...(currentId ? [{ id: currentId }] : [])] },
    select: { id: true, name: true, employeeType: true },
    orderBy: [{ name: "asc" }],
  });
}
export type ExpenseFormOptions = Awaited<ReturnType<typeof getExpenseFormOptions>>;

// ---------------------------------------------------------------------------
// Validation helpers (rules 2, 3, 4)
// ---------------------------------------------------------------------------

type Allocation = { projectId: number; headId: number; subheadId: number };

async function validateAllocation(actor: Actor, a: Allocation, existing?: Allocation) {
  const project = await assertProjectAccess(actor, a.projectId);
  if (project.status === "COMPLETED" && existing?.projectId !== a.projectId) {
    throw new AppError(`Project ${project.code} is Completed — no new expenses can be posted to it.`);
  }
  const [head, subhead] = await Promise.all([
    db.expenseHead.findUnique({ where: { id: a.headId } }),
    db.expenseSubhead.findUnique({ where: { id: a.subheadId } }),
  ]);
  if (!head) throw new AppError("The selected expense head does not exist.");
  if (!subhead || subhead.headId !== head.id) {
    throw new AppError(`The selected sub-head does not belong to the head "${head.name}".`);
  }
  // Disabled heads/sub-heads stay on old records but cannot be newly chosen.
  const unchanged = existing?.headId === a.headId && existing?.subheadId === a.subheadId;
  if (!unchanged) {
    if (!head.isActive) throw new AppError(`The head "${head.name}" is disabled and cannot be used.`);
    if (!subhead.isActive) throw new AppError(`The sub-head "${subhead.name}" is disabled and cannot be used.`);
  }
  return { project, head, subhead };
}

async function validatePaidFrom(actor: Actor, paidFromId: number | null, existingId?: number | null) {
  if (!paidFromId || paidFromId === existingId) return;
  const w = await db.worker.findFirst({ where: { id: paidFromId, deletedAt: null } });
  if (!w || !w.isActive) throw new AppError("The selected employee for \"Paid from\" does not exist or is inactive.");
  if (!can.manageCash(actor.role) && w.userId !== actor.id) {
    throw new ForbiddenError("You can only record expenses paid from your own cash in hand.");
  }
}

async function validateParties(vendorId: number | null, workerId: number | null) {
  if (vendorId && !(await db.vendor.findFirst({ where: { id: vendorId, deletedAt: null } }))) {
    throw new AppError("The selected vendor does not exist.");
  }
  if (workerId && !(await db.worker.findFirst({ where: { id: workerId, deletedAt: null } }))) {
    throw new AppError("The selected worker does not exist.");
  }
}

/** Optional tax amount -> column value; blank or zero means no tax. */
function taxValue(v: string | null) {
  return v && toPaisa(v) > 0n ? new Prisma.Decimal(v) : null;
}

async function saveFiles(files: File[]): Promise<StoredFile[]> {
  const stored: StoredFile[] = [];
  for (const f of files) stored.push(await saveUpload(f, "receipts", RECEIPT_TYPES));
  return stored;
}

/** "EXP-2026-00042" — sequence per (Pakistan) calendar year, never reused (counts deleted rows). */
async function nextExpenseNo(tx: Tx) {
  const year = new Date(Date.now() + 5 * 3600_000).getUTCFullYear();
  const prefix = `EXP-${year}-`;
  const last = await tx.expense.findFirst({
    where: { expenseNo: { startsWith: prefix } },
    orderBy: { expenseNo: "desc" },
    select: { expenseNo: true },
  });
  const n = last ? Number(last.expenseNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

/** Retry when two users grab the same expense number at the same moment. */
async function withExpenseNoRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < 5 && isUniqueError(e, "expense")) continue;
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateExpenseInput =
  | { kind: "single"; data: ExpenseInput }
  | { kind: "split"; data: SplitExpenseInput }
  | { kind: "labour"; data: ExpenseInput & { workerId: number } };

/** Create an expense, a split bill (several linked rows) or a labour payment. Returns new ids. */
export async function createExpenses(actor: Actor, input: CreateExpenseInput, files: File[] = []) {
  const d = input.data;
  type Line = Allocation & { amount: string; gstAmount: string | null; whtAmount: string | null };
  let lines: Line[];
  if (input.kind === "split") {
    // The bill's taxes are shared across its lines in proportion to each line's amount.
    const weights = input.data.lines.map((l) => l.amount);
    const gst = d.gstAmount ? apportionMoney(d.gstAmount, weights) : null;
    const wht = d.whtAmount ? apportionMoney(d.whtAmount, weights) : null;
    lines = input.data.lines.map((l, i) => ({ ...l, gstAmount: gst?.[i] ?? null, whtAmount: wht?.[i] ?? null }));
  } else {
    const x = input.data;
    lines = [
      { projectId: x.projectId, headId: x.headId, subheadId: x.subheadId, amount: x.amount, gstAmount: x.gstAmount, whtAmount: x.whtAmount },
    ];
  }

  for (const line of lines) {
    const { head } = await validateAllocation(actor, line);
    if (input.kind === "labour" && head.name !== LABOUR_HEAD) {
      throw new AppError(`Labour payments must use the "${LABOUR_HEAD}" head.`);
    }
  }
  if (input.kind === "labour" && !d.workerId) throw new AppError("Select a worker.");
  await validateParties(d.vendorId, d.workerId);
  await validatePaidFrom(actor, d.paidFromId);
  if (files.length > MAX_ATTACHMENTS) throw new AppError(`You can attach at most ${MAX_ATTACHMENTS} files.`);

  const settings = await getSettings();
  const status = initialStatus(actor, settings.autoApprovePrivileged);
  const stored = await saveFiles(files); // validates type + size before anything is written to the DB
  const splitGroupId = input.kind === "split" ? randomUUID() : null;

  return withExpenseNoRetry(() =>
    db.$transaction(async (tx) => {
      const ids: number[] = [];
      for (const line of lines) {
        const expense = await tx.expense.create({
          data: {
            expenseNo: await nextExpenseNo(tx),
            date: parseInputDate(d.date),
            projectId: line.projectId,
            headId: line.headId,
            subheadId: line.subheadId,
            amount: new Prisma.Decimal(line.amount),
            gstAmount: taxValue(line.gstAmount),
            whtAmount: taxValue(line.whtAmount),
            paymentMode: d.paymentMode,
            chequeNo: d.paymentMode === "CHEQUE" ? d.chequeNo : null,
            paidTo: d.paidTo,
            vendorId: d.vendorId,
            workerId: d.workerId,
            paidFromId: d.paidFromId,
            referenceNo: d.referenceNo,
            description: d.description,
            status,
            approvedById: status === "APPROVED" ? actor.id : null,
            approvedAt: status === "APPROVED" ? new Date() : null,
            splitGroupId,
            createdById: actor.id,
          },
        });
        // Split bill: the same receipt file is linked to every line.
        if (stored.length) {
          await tx.attachment.createMany({
            data: stored.map((s) => ({ ...s, expenseId: expense.id, uploadedById: actor.id })),
          });
        }
        await logActivity(
          {
            userId: actor.id,
            action: "CREATE",
            entityType: "expense",
            entityId: expense.id,
            changes: {
              ...snapshot(expense),
              ...(stored.length ? { attachments: stored.map((s) => s.fileName) } : {}),
              ...(status === "APPROVED" ? { autoApproved: true } : {}),
            },
          },
          tx,
        );
        ids.push(expense.id);
      }
      return ids;
    }),
  );
}

// ---------------------------------------------------------------------------
// Update (rule 5: approved = locked except for Admin; rejected -> resubmitted)
// ---------------------------------------------------------------------------

export async function updateExpense(
  actor: Actor,
  id: number,
  data: ExpenseInput,
  opts: { newFiles?: File[]; removeAttachmentIds?: number[] } = {},
) {
  const existing = await loadExpense(actor, id);
  if (!canEditExpense(actor, existing)) {
    throw new ForbiddenError(
      existing.status === "APPROVED"
        ? "Approved expenses are locked. Only an Admin can edit them."
        : "Only the person who entered this expense, an Accountant or an Admin can edit it.",
    );
  }
  await validateAllocation(actor, data, existing);
  await validateParties(data.vendorId, data.workerId);
  await validatePaidFrom(actor, data.paidFromId, existing.paidFromId);

  const newFiles = opts.newFiles ?? [];
  const removeIds = (opts.removeAttachmentIds ?? []).filter((aid) => existing.attachments.some((a) => a.id === aid));
  if (existing.attachments.length - removeIds.length + newFiles.length > MAX_ATTACHMENTS) {
    throw new AppError(`An expense can have at most ${MAX_ATTACHMENTS} attachments.`);
  }

  let status = existing.status;
  if (existing.status === "REJECTED") {
    // Editing a rejected entry resubmits it for approval.
    status = initialStatus(actor, (await getSettings()).autoApprovePrivileged);
  }

  const stored = await saveFiles(newFiles);
  const fields = {
    date: parseInputDate(data.date),
    projectId: data.projectId,
    headId: data.headId,
    subheadId: data.subheadId,
    amount: new Prisma.Decimal(data.amount),
    gstAmount: taxValue(data.gstAmount),
    whtAmount: taxValue(data.whtAmount),
    paymentMode: data.paymentMode,
    chequeNo: data.paymentMode === "CHEQUE" ? data.chequeNo : null,
    paidTo: data.paidTo,
    vendorId: data.vendorId,
    workerId: data.workerId,
    paidFromId: data.paidFromId,
    referenceNo: data.referenceNo,
    description: data.description,
  };
  const statusFields =
    status !== existing.status
      ? {
          status,
          rejectionReason: null,
          approvedById: status === "APPROVED" ? actor.id : null,
          approvedAt: status === "APPROVED" ? new Date() : null,
        }
      : {};

  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id }, data: { ...fields, ...statusFields } });
    if (removeIds.length) await tx.attachment.deleteMany({ where: { id: { in: removeIds }, expenseId: id } });
    if (stored.length) {
      await tx.attachment.createMany({ data: stored.map((s) => ({ ...s, expenseId: id, uploadedById: actor.id })) });
    }
    const changes: Record<string, unknown> = diffChanges(existing, { ...fields, ...statusFields });
    if (removeIds.length) {
      changes.attachmentsRemoved = existing.attachments.filter((a) => removeIds.includes(a.id)).map((a) => a.fileName);
    }
    if (stored.length) changes.attachmentsAdded = stored.map((s) => s.fileName);
    if (existing.status === "APPROVED") changes.editedWhileApproved = true;
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "expense", entityId: id, changes }, tx);
    }
  });
  return { status };
}

// ---------------------------------------------------------------------------
// Approve / reject / delete — act on the whole split bill
// ---------------------------------------------------------------------------

async function groupOf(expense: { id: number; splitGroupId: string | null }) {
  if (!expense.splitGroupId) return db.expense.findMany({ where: { id: expense.id } });
  return db.expense.findMany({ where: { splitGroupId: expense.splitGroupId, deletedAt: null } });
}

/** Approve a pending expense (every pending line of a split bill). Returns rows approved. */
export async function approveExpense(actor: Actor, id: number) {
  assertCan(actor, "approveExpenses", "Site In-charges cannot approve expenses.");
  const expense = await loadExpense(actor, id);
  if (!canApproveExpense(actor, expense)) throw new AppError("Only pending expenses can be approved.");
  const rows = (await groupOf(expense)).filter((e) => e.status === "PENDING");
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const e of rows) {
      await tx.expense.update({
        where: { id: e.id },
        data: { status: "APPROVED", approvedById: actor.id, approvedAt: now, rejectionReason: null },
      });
      await logActivity(
        {
          userId: actor.id,
          action: "APPROVE",
          entityType: "expense",
          entityId: e.id,
          changes: { status: { old: "PENDING", new: "APPROVED" } },
        },
        tx,
      );
    }
  });
  return rows.length;
}

export async function rejectExpense(actor: Actor, id: number, reason: string) {
  assertCan(actor, "approveExpenses", "Site In-charges cannot reject expenses.");
  if (!reason.trim()) throw new AppError("A rejection reason is required.");
  const expense = await loadExpense(actor, id);
  if (!canApproveExpense(actor, expense)) throw new AppError("Only pending expenses can be rejected.");
  const rows = (await groupOf(expense)).filter((e) => e.status === "PENDING");
  await db.$transaction(async (tx) => {
    for (const e of rows) {
      await tx.expense.update({
        where: { id: e.id },
        data: { status: "REJECTED", rejectionReason: reason.trim(), approvedById: null, approvedAt: null },
      });
      await logActivity(
        {
          userId: actor.id,
          action: "REJECT",
          entityType: "expense",
          entityId: e.id,
          changes: { status: { old: "PENDING", new: "REJECTED" }, rejectionReason: reason.trim() },
        },
        tx,
      );
    }
  });
  return rows.length;
}

/** Soft delete (rule 8). Deleting one line of a split bill deletes the whole bill. */
export async function deleteExpense(actor: Actor, id: number) {
  const expense = await loadExpense(actor, id);
  const rows = await groupOf(expense);
  for (const e of rows) {
    if (!canDeleteExpense(actor, e)) {
      throw new ForbiddenError(
        e.status === "APPROVED"
          ? "Approved expenses are locked. Only an Admin can delete them."
          : "You cannot delete this expense.",
      );
    }
    await assertProjectAccess(actor, e.projectId);
  }
  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const e of rows) {
      await tx.expense.update({ where: { id: e.id }, data: { deletedAt: now } });
      await logActivity(
        { userId: actor.id, action: "DELETE", entityType: "expense", entityId: e.id, changes: snapshot(e) },
        tx,
      );
    }
  });
  return rows.length;
}
