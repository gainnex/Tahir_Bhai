import { Prisma, type CashEntryType } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { parseInputDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { CashEntryInput } from "@/lib/validation/cash";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { diffChanges, logActivity, snapshot } from "./activity-log";

// Employee cash in hand (changes/changes.pdf §1). Money moves between the company and an
// employee as cash entries (opening balance, funds given, cash returned); the employee's
// spending is ordinary expenses with paid_from_id set. Only APPROVED expenses reduce the
// balance, like every other total (business rule 6). Pending ones are shown separately.

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

export type CashBalance = {
  opening: Prisma.Decimal;
  issued: Prisma.Decimal;
  returned: Prisma.Decimal;
  spent: Prisma.Decimal; // approved expenses paid from this cash
  pendingSpent: Prisma.Decimal;
  pendingCount: number;
  /** opening + issued - returned - spent. Negative = the company owes the employee. */
  balance: Prisma.Decimal;
};

/** Each type's sign in the balance. */
const SIGN: Record<CashEntryType, 1 | -1> = { OPENING: 1, ISSUED: 1, RETURNED: -1 };

/** Admin/Accountant see anyone's cash; others only their own linked employee record. */
async function assertCashAccess(actor: Actor, workerId: number) {
  if (can.manageCash(actor.role)) return;
  const w = await db.worker.findFirst({ where: { id: workerId, userId: actor.id, deletedAt: null } });
  if (!w) throw new ForbiddenError("You can only see your own cash in hand.");
}

/** Balances for the given employees (all employees with any cash activity when omitted). */
export async function cashBalances(workerIds?: number[], opts: { before?: Date } = {}) {
  const idFilter = workerIds ? { in: workerIds } : undefined;
  const dateFilter = opts.before ? { lt: opts.before } : undefined;
  const [entries, spent] = await Promise.all([
    db.cashEntry.groupBy({
      by: ["workerId", "type"],
      where: { deletedAt: null, ...(idFilter ? { workerId: idFilter } : {}), ...(dateFilter ? { date: dateFilter } : {}) },
      _sum: { amount: true },
    }),
    db.expense.groupBy({
      by: ["paidFromId", "status"],
      where: {
        deletedAt: null,
        status: { in: ["APPROVED", "PENDING"] },
        paidFromId: idFilter ?? { not: null },
        ...(dateFilter ? { date: dateFilter } : {}),
      },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const out = new Map<number, CashBalance>();
  const get = (id: number) => {
    let b = out.get(id);
    if (!b) {
      b = { opening: ZERO, issued: ZERO, returned: ZERO, spent: ZERO, pendingSpent: ZERO, pendingCount: 0, balance: ZERO };
      out.set(id, b);
    }
    return b;
  };
  for (const r of entries) {
    const b = get(r.workerId);
    const amt = r._sum.amount ?? ZERO;
    if (r.type === "OPENING") b.opening = b.opening.plus(amt);
    else if (r.type === "ISSUED") b.issued = b.issued.plus(amt);
    else b.returned = b.returned.plus(amt);
  }
  for (const r of spent) {
    if (r.paidFromId === null) continue;
    const b = get(r.paidFromId);
    if (r.status === "APPROVED") b.spent = b.spent.plus(r._sum.amount ?? ZERO);
    else {
      b.pendingSpent = b.pendingSpent.plus(r._sum.amount ?? ZERO);
      b.pendingCount += r._count;
    }
  }
  for (const b of out.values()) b.balance = b.opening.plus(b.issued).minus(b.returned).minus(b.spent);
  return out;
}

/** "Cash in hand" overview: every employee with cash activity, plus active staff. */
export async function listCashHolders(actor: Actor) {
  assertCan(actor, "manageCash");
  const balances = await cashBalances();
  const workers = await db.worker.findMany({
    where: {
      deletedAt: null,
      OR: [{ id: { in: [...balances.keys()] } }, { isActive: true, employeeType: { not: "LABOUR" } }],
    },
    select: { id: true, name: true, designation: true, employeeType: true, isActive: true, user: { select: { username: true } } },
    orderBy: { name: "asc" },
  });
  const empty: CashBalance = {
    opening: ZERO,
    issued: ZERO,
    returned: ZERO,
    spent: ZERO,
    pendingSpent: ZERO,
    pendingCount: 0,
    balance: ZERO,
  };
  const rows = workers.map((w) => ({ ...w, ...(balances.get(w.id) ?? empty) }));
  return { rows, ...splitBalances(rows.map((r) => r.balance)) };
}

/** Positive balances = cash held by employees; negative ones = owed to employees. */
function splitBalances(balances: Prisma.Decimal[]) {
  let held = ZERO;
  let owed = ZERO;
  let heldCount = 0;
  let owedCount = 0;
  for (const b of balances) {
    if (b.isNegative()) {
      owed = owed.plus(b.neg());
      owedCount++;
    } else if (!b.isZero()) {
      held = held.plus(b);
      heldCount++;
    }
  }
  return { held, owed, heldCount, owedCount };
}

/** Cash currently held by / owed to employees (dashboard). */
export async function totalCashWithEmployees() {
  return splitBalances([...(await cashBalances()).values()].map((b) => b.balance));
}

export type StatementRow = {
  key: string;
  date: Date;
  kind: "entry" | "expense";
  id: number;
  number: string;
  description: string;
  project: { code: string; name: string } | null;
  paymentMode: string;
  moneyIn: Prisma.Decimal | null;
  moneyOut: Prisma.Decimal | null;
  /** Running balance; null for pending expenses (not counted yet) */
  balance: Prisma.Decimal | null;
  status?: "PENDING" | "APPROVED";
};

/**
 * One employee's cash statement: entries and expenses in date order with a running balance.
 * With `from`, everything earlier is collapsed into a "brought forward" figure.
 */
export async function getCashStatement(actor: Actor, workerId: number, opts: { from?: string; to?: string } = {}) {
  await assertCashAccess(actor, workerId);
  const worker = await db.worker.findFirst({
    where: { id: workerId, deletedAt: null },
    select: { id: true, name: true, designation: true, employeeType: true, isActive: true, phone: true, userId: true },
  });
  if (!worker) throw new NotFoundError("Employee");

  const from = opts.from ? parseInputDate(opts.from) : undefined;
  const to = opts.to ? parseInputDate(opts.to) : undefined;
  const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const [entries, expenses, totals, broughtForward] = await Promise.all([
    db.cashEntry.findMany({
      where: { workerId, deletedAt: null, date: range },
      include: { project: { select: { code: true, name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    db.expense.findMany({
      where: { paidFromId: workerId, deletedAt: null, status: { in: ["APPROVED", "PENDING"] }, date: range },
      include: { project: { select: { code: true, name: true } }, head: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
    cashBalances([workerId]),
    from ? cashBalances([workerId], { before: from }) : Promise.resolve(null),
  ]);

  const opening = broughtForward?.get(workerId)?.balance ?? ZERO;
  type Raw = Omit<StatementRow, "balance">;
  const raw: Raw[] = [
    ...entries.map(
      (e): Raw => ({
        key: `c${e.id}`,
        date: e.date,
        kind: "entry",
        id: e.id,
        number: e.entryNo,
        description: [ENTRY_TEXT[e.type], e.notes].filter(Boolean).join(" — "),
        project: e.project,
        paymentMode: e.paymentMode,
        moneyIn: SIGN[e.type] > 0 ? e.amount : null,
        moneyOut: SIGN[e.type] < 0 ? e.amount : null,
      }),
    ),
    ...expenses.map(
      (x): Raw => ({
        key: `e${x.id}`,
        date: x.date,
        kind: "expense",
        id: x.id,
        number: x.expenseNo,
        description: `${x.head.name}: ${x.description} (paid to ${x.paidTo})`,
        project: x.project,
        paymentMode: x.paymentMode,
        moneyIn: null,
        moneyOut: x.amount,
        status: x.status === "PENDING" ? "PENDING" : "APPROVED",
      }),
    ),
  ];
  // Same day: money in before money out, so a same-day top-up and spend reads naturally.
  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.moneyIn ? 0 : 1) - (b.moneyIn ? 0 : 1) || a.id - b.id);

  let running = opening;
  const rows: StatementRow[] = raw.map((r) => {
    if (r.status === "PENDING") return { ...r, balance: null };
    running = running.plus(r.moneyIn ?? ZERO).minus(r.moneyOut ?? ZERO);
    return { ...r, balance: running };
  });

  return {
    worker,
    rows,
    broughtForward: from ? opening : null,
    closing: running,
    current: totals.get(workerId) ?? null,
  };
}

const ENTRY_TEXT: Record<CashEntryType, string> = {
  OPENING: "Previous balance in hand",
  ISSUED: "Funds given",
  RETURNED: "Returned to company",
};

// ---------------------------------------------------------------------------
// Create / update / delete (Admin & Accountant)
// ---------------------------------------------------------------------------

async function validate(input: CashEntryInput, existing?: { workerId: number; projectId: number | null }) {
  const w = await db.worker.findFirst({ where: { id: input.workerId, deletedAt: null } });
  if (!w) throw new AppError("The selected employee does not exist.");
  if (!w.isActive && existing?.workerId !== input.workerId) throw new AppError(`${w.name} is inactive.`);
  if (input.projectId && input.projectId !== existing?.projectId) {
    const p = await db.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
    if (!p) throw new AppError("The selected project does not exist.");
  }
}

function entryData(input: CashEntryInput) {
  return {
    date: parseInputDate(input.date),
    workerId: input.workerId,
    type: input.type,
    amount: new Prisma.Decimal(input.amount),
    paymentMode: input.paymentMode,
    projectId: input.projectId,
    referenceNo: input.referenceNo,
    notes: input.notes,
  };
}

/** "CSH-2026-00007" — sequence per (Pakistan) calendar year, never reused. */
async function nextEntryNo(tx: Tx) {
  const year = new Date(Date.now() + 5 * 3600_000).getUTCFullYear();
  const prefix = `CSH-${year}-`;
  const last = await tx.cashEntry.findFirst({
    where: { entryNo: { startsWith: prefix } },
    orderBy: { entryNo: "desc" },
    select: { entryNo: true },
  });
  const n = last ? Number(last.entryNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export async function createCashEntry(actor: Actor, input: CashEntryInput) {
  assertCan(actor, "manageCash");
  await validate(input);
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const entry = await tx.cashEntry.create({
          data: { ...entryData(input), entryNo: await nextEntryNo(tx), createdById: actor.id },
        });
        await logActivity(
          { userId: actor.id, action: "CREATE", entityType: "cash_entry", entityId: entry.id, changes: snapshot(entry) },
          tx,
        );
        return entry;
      });
    } catch (e) {
      if (attempt < 5 && isUniqueError(e, "entry")) continue;
      throw e;
    }
  }
}

export async function getCashEntryForEdit(actor: Actor, id: number) {
  assertCan(actor, "manageCash");
  const entry = await db.cashEntry.findFirst({
    where: { id, deletedAt: null },
    include: { worker: { select: { id: true, name: true } } },
  });
  if (!entry) throw new NotFoundError("Cash entry");
  return entry;
}

export async function updateCashEntry(actor: Actor, id: number, input: CashEntryInput) {
  assertCan(actor, "manageCash");
  const before = await db.cashEntry.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("Cash entry");
  await validate(input, before);
  const data = entryData(input);
  await db.$transaction(async (tx) => {
    await tx.cashEntry.update({ where: { id }, data });
    const changes = diffChanges(before, data);
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "cash_entry", entityId: id, changes }, tx);
    }
  });
  return before.workerId;
}

/** Soft delete. Returns the employee id so the caller can go back to the statement. */
export async function deleteCashEntry(actor: Actor, id: number) {
  assertCan(actor, "manageCash");
  const entry = await db.cashEntry.findFirst({ where: { id, deletedAt: null } });
  if (!entry) throw new NotFoundError("Cash entry");
  await db.$transaction(async (tx) => {
    await tx.cashEntry.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "cash_entry", entityId: id, changes: snapshot(entry) },
      tx,
    );
  });
  return entry.workerId;
}

/** Dropdowns for the cash entry form. */
export async function getCashFormOptions(current?: { workerId: number; projectId: number | null }) {
  const [workers, projects] = await Promise.all([
    db.worker.findMany({
      where: { deletedAt: null, OR: [{ isActive: true }, ...(current ? [{ id: current.workerId }] : [])] },
      select: { id: true, name: true, employeeType: true, designation: true },
      orderBy: { name: "asc" },
    }),
    db.project.findMany({
      where: { deletedAt: null, OR: [{ status: { not: "COMPLETED" } }, ...(current?.projectId ? [{ id: current.projectId }] : [])] },
      select: { id: true, code: true, name: true },
      orderBy: [{ isHeadOffice: "desc" }, { code: "asc" }],
    }),
  ]);
  return { workers, projects };
}
