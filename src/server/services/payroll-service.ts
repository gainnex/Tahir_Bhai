import { Prisma, type AttendanceStatus, type EmployeeType, type PaymentMode } from "@prisma/client";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { AppError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { formatAmount, parseInputDate, todayPK } from "@/lib/format";
import { can } from "@/lib/permissions";
import { basicPay, daysInMonth, monthLabel, monthRange, payableDays, type AttendanceCounts } from "@/lib/payroll";
import type { Report } from "@/lib/reports";
import { EMPLOYEE_TYPE_LABELS } from "@/lib/validation/parties";
import {
  ATTENDANCE_CODES,
  PAY_ADDITIONS,
  type AttendanceSheetInput,
  type PayAdjustmentInput,
} from "@/lib/validation/payroll";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { createExpenses } from "./expense-service";

// Office attendance, pay adjustments and the monthly wage sheet (changes/changes.pdf §3).
// Wages are calculated here; paying them is a labour payment (an expense under the Workers
// head) — entered by hand or posted from the wage sheet (postWages) to each employee's cost
// center (project / sub office / head office) — which the wage sheet subtracts as "paid".

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

/** Employees whose attendance the actor may mark: everyone, or a site in-charge's project staff. */
function attendanceScope(actor: Actor): Prisma.WorkerWhereInput {
  if (can.markAllAttendance(actor.role)) return { deletedAt: null };
  return { deletedAt: null, defaultProject: { deletedAt: null, users: { some: { userId: actor.id } } } };
}

const workerSelect = {
  id: true,
  name: true,
  designation: true,
  employeeType: true,
  isActive: true,
  defaultProject: { select: { code: true } },
} satisfies Prisma.WorkerSelect;

/** One day's sheet: employees in scope (active, or already marked that day) with their marks. */
export async function getAttendanceDay(actor: Actor, date: string) {
  const day = parseInputDate(date);
  const scope = attendanceScope(actor);
  const [workers, marks] = await Promise.all([
    db.worker.findMany({
      where: { AND: [scope, { OR: [{ isActive: true }, { attendance: { some: { date: day } } }] }] },
      select: workerSelect,
      orderBy: [{ employeeType: "desc" }, { name: "asc" }],
    }),
    db.attendance.findMany({ where: { date: day, worker: scope }, select: { workerId: true, status: true } }),
  ]);
  const byWorker: Record<number, AttendanceStatus> = Object.fromEntries(marks.map((m) => [m.workerId, m.status]));
  return { workers, marks: byWorker };
}

/** Save a day's sheet. Returns how many employees' marks changed. */
export async function saveAttendance(actor: Actor, input: AttendanceSheetInput) {
  if (input.date > todayPK()) throw new AppError("Attendance cannot be marked for a future date.");
  const day = parseInputDate(input.date);
  const ids = [...new Set(input.marks.map((m) => m.workerId))];
  const allowed = await db.worker.findMany({ where: { AND: [attendanceScope(actor), { id: { in: ids } }] } });
  if (allowed.length !== ids.length) {
    throw new ForbiddenError("You can only mark attendance for employees of your assigned projects.");
  }
  const workerById = new Map(allowed.map((w) => [w.id, w]));
  const existing = new Map(
    (await db.attendance.findMany({ where: { date: day, workerId: { in: ids } } })).map((a) => [a.workerId, a]),
  );

  let changed = 0;
  await db.$transaction(async (tx) => {
    for (const m of input.marks) {
      const before = existing.get(m.workerId);
      if ((before?.status ?? null) === m.status) continue;
      if (m.status && !before && !workerById.get(m.workerId)!.isActive) {
        throw new AppError(`${workerById.get(m.workerId)!.name} is inactive.`);
      }
      if (!m.status) await tx.attendance.delete({ where: { id: before!.id } });
      else if (before) await tx.attendance.update({ where: { id: before.id }, data: { status: m.status, markedById: actor.id } });
      else await tx.attendance.create({ data: { date: day, workerId: m.workerId, status: m.status, markedById: actor.id } });
      // Logged against the employee, so the log reads "attendance — <name>"
      await logActivity(
        {
          userId: actor.id,
          action: !before ? "CREATE" : m.status ? "UPDATE" : "DELETE",
          entityType: "attendance",
          entityId: m.workerId,
          changes: { date: input.date, status: { old: before?.status ?? null, new: m.status } },
        },
        tx,
      );
      changed += 1;
    }
  });
  return changed;
}

function emptyCounts(): AttendanceCounts {
  return { present: 0, halfDay: 0, absent: 0, leave: 0 };
}

function addMark(c: AttendanceCounts, s: AttendanceStatus) {
  if (s === "PRESENT") c.present += 1;
  else if (s === "HALF_DAY") c.halfDay += 1;
  else if (s === "ABSENT") c.absent += 1;
  else c.leave += 1;
}

/** Attendance counts per employee for a month. */
async function monthCounts(month: string, where: Prisma.AttendanceWhereInput = {}) {
  const { from, to } = monthRange(month);
  const rows = await db.attendance.groupBy({
    by: ["workerId", "status"],
    where: { ...where, date: { gte: parseInputDate(from), lte: parseInputDate(to) } },
    _count: true,
  });
  const out = new Map<number, AttendanceCounts>();
  for (const r of rows) {
    const c = out.get(r.workerId) ?? emptyCounts();
    for (let i = 0; i < r._count; i++) addMark(c, r.status);
    out.set(r.workerId, c);
  }
  return out;
}

/** Monthly register: one row per employee, one letter per day (P / H / A / L). */
export async function getAttendanceRegister(actor: Actor, month: string) {
  const { from, to } = monthRange(month);
  const range = { gte: parseInputDate(from), lte: parseInputDate(to) };
  const scope = attendanceScope(actor);
  const [workers, marks] = await Promise.all([
    db.worker.findMany({
      where: { AND: [scope, { OR: [{ isActive: true }, { attendance: { some: { date: range } } }] }] },
      select: workerSelect,
      orderBy: [{ employeeType: "desc" }, { name: "asc" }],
    }),
    db.attendance.findMany({ where: { date: range, worker: scope }, select: { workerId: true, date: true, status: true } }),
  ]);
  const days = daysInMonth(month);
  const grid = new Map<number, { codes: (string | null)[]; counts: AttendanceCounts }>();
  for (const w of workers) grid.set(w.id, { codes: Array(days).fill(null), counts: emptyCounts() });
  for (const m of marks) {
    const g = grid.get(m.workerId);
    if (!g) continue;
    g.codes[m.date.getUTCDate() - 1] = ATTENDANCE_CODES[m.status];
    addMark(g.counts, m.status);
  }
  return { days, rows: workers.map((w) => ({ worker: w, ...grid.get(w.id)! })) };
}

// ---------------------------------------------------------------------------
// Pay adjustments (benefits, rewards, incentives, deductions, advance recovery)
// ---------------------------------------------------------------------------

async function validateAdjustment(input: PayAdjustmentInput, existingWorkerId?: number) {
  const w = await db.worker.findFirst({ where: { id: input.workerId, deletedAt: null } });
  if (!w) throw new AppError("The selected employee does not exist.");
  if (!w.isActive && existingWorkerId !== input.workerId) throw new AppError(`${w.name} is inactive.`);
}

function adjustmentData(input: PayAdjustmentInput) {
  return {
    date: parseInputDate(input.date),
    workerId: input.workerId,
    type: input.type,
    amount: new Prisma.Decimal(input.amount),
    notes: input.notes,
  };
}

/** "ADJ-2026-00007" — sequence per (Pakistan) calendar year, never reused. */
async function nextAdjustmentNo(tx: Tx) {
  const year = new Date(Date.now() + 5 * 3600_000).getUTCFullYear();
  const prefix = `ADJ-${year}-`;
  const last = await tx.payAdjustment.findFirst({
    where: { entryNo: { startsWith: prefix } },
    orderBy: { entryNo: "desc" },
    select: { entryNo: true },
  });
  const n = last ? Number(last.entryNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(5, "0")}`;
}

export async function createPayAdjustment(actor: Actor, input: PayAdjustmentInput) {
  assertCan(actor, "managePayroll");
  await validateAdjustment(input);
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const adj = await tx.payAdjustment.create({
          data: { ...adjustmentData(input), entryNo: await nextAdjustmentNo(tx), createdById: actor.id },
        });
        await logActivity(
          { userId: actor.id, action: "CREATE", entityType: "pay_adjustment", entityId: adj.id, changes: snapshot(adj) },
          tx,
        );
        return adj;
      });
    } catch (e) {
      if (attempt < 5 && isUniqueError(e, "entry")) continue;
      throw e;
    }
  }
}

export async function getPayAdjustment(actor: Actor, id: number) {
  assertCan(actor, "managePayroll");
  const adj = await db.payAdjustment.findFirst({ where: { id, deletedAt: null } });
  if (!adj) throw new NotFoundError("Pay adjustment");
  return adj;
}

export async function updatePayAdjustment(actor: Actor, id: number, input: PayAdjustmentInput) {
  const before = await getPayAdjustment(actor, id);
  await validateAdjustment(input, before.workerId);
  const data = adjustmentData(input);
  await db.$transaction(async (tx) => {
    await tx.payAdjustment.update({ where: { id }, data });
    const changes = diffChanges(before, data);
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "pay_adjustment", entityId: id, changes }, tx);
    }
  });
}

/** Soft delete. */
export async function deletePayAdjustment(actor: Actor, id: number) {
  const adj = await getPayAdjustment(actor, id);
  await db.$transaction(async (tx) => {
    await tx.payAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "pay_adjustment", entityId: id, changes: snapshot(adj) },
      tx,
    );
  });
}

export async function listPayAdjustments(actor: Actor, month: string) {
  assertCan(actor, "managePayroll");
  const { from, to } = monthRange(month);
  return db.payAdjustment.findMany({
    where: { deletedAt: null, date: { gte: parseInputDate(from), lte: parseInputDate(to) } },
    include: { worker: { select: { id: true, name: true } } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

/** Employees for the adjustment form (active, plus the record's current one). */
export async function payAdjustmentWorkers(currentId?: number) {
  return db.worker.findMany({
    where: { deletedAt: null, OR: [{ isActive: true }, ...(currentId ? [{ id: currentId }] : [])] },
    select: { id: true, name: true, employeeType: true, designation: true },
    orderBy: { name: "asc" },
  });
}

// ---------------------------------------------------------------------------
// Wage sheet
// ---------------------------------------------------------------------------

export type WageRow = {
  worker: { id: number; name: string; employeeType: EmployeeType; designation: string | null; rateType: "DAILY" | "MONTHLY"; rate: Prisma.Decimal };
  /** Where the employee's pay is charged (their default project / sub office / head office) */
  costCenter: { id: number; code: string; name: string; status: string; isHeadOffice: boolean; isSubOffice: boolean } | null;
  counts: AttendanceCounts;
  payableDays: number;
  basic: Prisma.Decimal;
  additions: Prisma.Decimal;
  deductions: Prisma.Decimal;
  net: Prisma.Decimal;
  /** Approved labour payments this month (advances excluded) */
  paid: Prisma.Decimal;
  due: Prisma.Decimal;
  /** Advances given up to the month end, less advance recoveries */
  advanceBalance: Prisma.Decimal;
};

const sumBy = <T extends { workerId: number | null }>(rows: T[], get: (r: T) => Prisma.Decimal | null) => {
  const out = new Map<number, Prisma.Decimal>();
  for (const r of rows) if (r.workerId) out.set(r.workerId, (out.get(r.workerId) ?? ZERO).plus(get(r) ?? ZERO));
  return out;
};

/** Monthly wages per employee: attendance × rate, ± adjustments, less what was already paid. */
export type WageSheetOptions = { employeeType?: EmployeeType; costCenterId?: number };

export async function getWageSheet(actor: Actor, month: string, opts: WageSheetOptions = {}) {
  assertCan(actor, "managePayroll");
  const { from, to } = monthRange(month);
  const range = { gte: parseInputDate(from), lte: parseInputDate(to) };
  const days = daysInMonth(month);
  const labourPaid = { status: "APPROVED" as const, deletedAt: null, head: { name: LABOUR_HEAD } };

  const [workers, counts, adjustments, paid, advances, recoveries] = await Promise.all([
    db.worker.findMany({
      where: {
        deletedAt: null,
        ...(opts.employeeType ? { employeeType: opts.employeeType } : {}),
        ...(opts.costCenterId ? { defaultProjectId: opts.costCenterId } : {}),
        OR: [
          { isActive: true },
          { attendance: { some: { date: range } } },
          { payAdjustments: { some: { date: range, deletedAt: null } } },
          { expenses: { some: { ...labourPaid, date: range } } },
        ],
      },
      select: {
        id: true,
        name: true,
        employeeType: true,
        designation: true,
        rateType: true,
        rate: true,
        defaultProject: {
          select: { id: true, code: true, name: true, status: true, isHeadOffice: true, isSubOffice: true, deletedAt: true },
        },
      },
      orderBy: [{ employeeType: "desc" }, { name: "asc" }],
    }),
    monthCounts(month),
    db.payAdjustment.groupBy({ by: ["workerId", "type"], where: { deletedAt: null, date: range }, _sum: { amount: true } }),
    db.expense.groupBy({
      by: ["workerId"],
      where: { ...labourPaid, date: range, workerId: { not: null }, subhead: { name: { not: ADVANCE_SUBHEAD } } },
      _sum: { amount: true },
    }),
    db.expense.groupBy({
      by: ["workerId"],
      where: { ...labourPaid, date: { lte: range.lte }, workerId: { not: null }, subhead: { name: ADVANCE_SUBHEAD } },
      _sum: { amount: true },
    }),
    db.payAdjustment.groupBy({
      by: ["workerId"],
      where: { deletedAt: null, type: "ADVANCE_RECOVERY", date: { lte: range.lte } },
      _sum: { amount: true },
    }),
  ]);

  const additions = sumBy(adjustments.filter((a) => PAY_ADDITIONS.includes(a.type)), (a) => a._sum.amount);
  const deductions = sumBy(adjustments.filter((a) => !PAY_ADDITIONS.includes(a.type)), (a) => a._sum.amount);
  const paidBy = sumBy(paid, (p) => p._sum.amount);
  const advancesBy = sumBy(advances, (p) => p._sum.amount);
  const recoveredBy = sumBy(recoveries, (p) => p._sum.amount);

  const rows: WageRow[] = workers.map((w) => {
    const c = counts.get(w.id) ?? emptyCounts();
    const basic = new Prisma.Decimal(basicPay(w.rateType, w.rate.toFixed(2), c, days));
    const add = additions.get(w.id) ?? ZERO;
    const ded = deductions.get(w.id) ?? ZERO;
    const net = basic.plus(add).minus(ded);
    const p = paidBy.get(w.id) ?? ZERO;
    const { defaultProject: cc, ...worker } = w;
    return {
      worker,
      costCenter: cc && !cc.deletedAt ? { id: cc.id, code: cc.code, name: cc.name, status: cc.status, isHeadOffice: cc.isHeadOffice, isSubOffice: cc.isSubOffice } : null,
      counts: c,
      payableDays: payableDays(w.rateType, c, days),
      basic,
      additions: add,
      deductions: ded,
      net,
      paid: p,
      due: net.minus(p),
      advanceBalance: (advancesBy.get(w.id) ?? ZERO).minus(recoveredBy.get(w.id) ?? ZERO),
    };
  });
  const total = (k: "basic" | "additions" | "deductions" | "net" | "paid" | "due" | "advanceBalance") =>
    rows.reduce((s, r) => s.plus(r[k]), ZERO);
  return {
    month,
    days,
    rows,
    /** Positive balances only: what is still to be paid out */
    toPay: rows.reduce((s, r) => (r.due.isPositive() ? s.plus(r.due) : s), ZERO),
    /** Paid more than the month's wages so far (e.g. paid before attendance was marked) */
    paidAhead: rows.reduce((s, r) => (r.due.isNegative() ? s.minus(r.due) : s), ZERO),
    totals: {
      basic: total("basic"),
      additions: total("additions"),
      deductions: total("deductions"),
      net: total("net"),
      paid: total("paid"),
      due: total("due"),
      advanceBalance: total("advanceBalance"),
    },
  };
}

/** The wage sheet as a report (screen, Excel, PDF). `print` adds a signature column. */
export async function wageSheetReport(
  actor: Actor,
  month: string,
  opts: WageSheetOptions & { print?: boolean } = {},
): Promise<Report> {
  const sheet = await getWageSheet(actor, month, opts);
  const money = (d: Prisma.Decimal) => d.toFixed(2);
  const filteredCenter = opts.costCenterId
    ? await db.project.findUnique({ where: { id: opts.costCenterId }, select: { code: true, name: true } })
    : null;

  // Totals per cost center (project / sub office / head office)
  type Center = { label: string; kind: string; employees: number; net: Prisma.Decimal; paid: Prisma.Decimal; toPay: Prisma.Decimal };
  const centers = new Map<string, Center>();
  for (const r of sheet.rows) {
    const key = r.costCenter ? String(r.costCenter.id) : "none";
    const c = centers.get(key) ?? {
      label: r.costCenter ? `${r.costCenter.code} — ${r.costCenter.name}` : "Not allocated",
      kind: !r.costCenter ? "" : r.costCenter.isHeadOffice ? "Head office" : r.costCenter.isSubOffice ? "Sub office" : "Project",
      employees: 0,
      net: ZERO,
      paid: ZERO,
      toPay: ZERO,
    };
    c.employees += 1;
    c.net = c.net.plus(r.net);
    c.paid = c.paid.plus(r.paid);
    if (r.due.isPositive()) c.toPay = c.toPay.plus(r.due);
    centers.set(key, c);
  }
  return {
    slug: "wage-sheet",
    title: `Wage Sheet — ${monthLabel(month)}`,
    subtitle: [
      opts.employeeType ? EMPLOYEE_TYPE_LABELS[opts.employeeType] : "All employees",
      ...(filteredCenter ? [`Cost center: ${filteredCenter.code} ${filteredCenter.name}`] : []),
      `${sheet.days} days`,
      "Approved payments only",
    ].join(" · "),
    landscape: true,
    tables: [
      {
        columns: [
          { key: "employee", label: "Employee", type: "text", wide: true },
          { key: "center", label: "Cost center", type: "text" },
          { key: "rate", label: "Rate", type: "text" },
          { key: "attendance", label: "P / H / A / L", type: "text" },
          { key: "days", label: "Paid days", type: "text" },
          { key: "basic", label: "Basic", type: "money" },
          { key: "additions", label: "Benefits", type: "money" },
          { key: "deductions", label: "Deductions", type: "money" },
          { key: "net", label: "Net payable", type: "money" },
          { key: "paid", label: "Paid", type: "money" },
          { key: "due", label: "Balance due", type: "money" },
          { key: "advance", label: "Advance o/s", type: "money" },
          ...(opts.print ? [{ key: "signature", label: "Signature", type: "text" as const, wide: true }] : []),
        ],
        rows: sheet.rows.map((r) => ({
          cells: {
            employee: r.worker.designation ? `${r.worker.name} (${r.worker.designation})` : r.worker.name,
            center: r.costCenter?.code ?? "—",
            rate: `${formatAmount(r.worker.rate)}/${r.worker.rateType === "DAILY" ? "day" : "mo"}`,
            attendance: [r.counts.present, r.counts.halfDay, r.counts.absent, r.counts.leave].join(" / "),
            days: String(r.payableDays),
            basic: money(r.basic),
            additions: r.additions.isZero() ? null : money(r.additions),
            deductions: r.deductions.isZero() ? null : money(r.deductions),
            net: money(r.net),
            paid: r.paid.isZero() ? null : money(r.paid),
            due: money(r.due),
            advance: r.advanceBalance.isZero() ? null : money(r.advanceBalance),
            ...(opts.print ? { signature: "" } : {}),
          },
          links: {
            employee: `/workers/${r.worker.id}`,
            ...(r.due.isPositive() && !r.due.isZero() ? { due: `/labour-payment?workerId=${r.worker.id}` } : {}),
          },
        })),
        totals: {
          employee: "Total",
          basic: money(sheet.totals.basic),
          additions: money(sheet.totals.additions),
          deductions: money(sheet.totals.deductions),
          net: money(sheet.totals.net),
          paid: money(sheet.totals.paid),
          due: money(sheet.totals.due),
          advance: money(sheet.totals.advanceBalance),
        },
        empty: "No employees for this month.",
      },
      {
        title: "By cost center",
        columns: [
          { key: "center", label: "Cost center", type: "text", wide: true },
          { key: "kind", label: "Type", type: "text" },
          { key: "employees", label: "Employees", type: "int" },
          { key: "net", label: "Net payable", type: "money" },
          { key: "paid", label: "Paid", type: "money" },
          { key: "toPay", label: "Still to pay", type: "money" },
        ],
        rows: [...centers.values()].map((c) => ({
          cells: { center: c.label, kind: c.kind, employees: c.employees, net: money(c.net), paid: money(c.paid), toPay: money(c.toPay) },
        })),
        totals: { center: "Total", employees: sheet.rows.length, net: money(sheet.totals.net), paid: money(sheet.totals.paid), toPay: money(sheet.toPay) },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Post wages: turn the wage sheet's balance due into labour payments
// ---------------------------------------------------------------------------

export const SALARY_SUBHEAD = "Salaries";
export const WAGES_SUBHEAD = "Daily wages";

/** Why each employee can't be paid from the wage sheet right now (absent = ready to pay). */
async function postingProblems(rows: WageRow[], month: string) {
  const out = new Map<number, string>();
  for (const r of rows) {
    if (!r.due.isPositive() || r.due.isZero()) out.set(r.worker.id, "nothing due");
    else if (!r.costCenter) out.set(r.worker.id, "no cost center — set one on the employee");
    else if (r.costCenter.status === "COMPLETED") out.set(r.worker.id, `cost center ${r.costCenter.code} is Completed`);
  }
  // A pending payment would be paid twice once approved
  const { from, to } = monthRange(month);
  const pending = await db.expense.findMany({
    where: {
      status: "PENDING",
      deletedAt: null,
      workerId: { in: rows.map((r) => r.worker.id) },
      head: { name: LABOUR_HEAD },
      subhead: { name: { not: ADVANCE_SUBHEAD } },
      date: { gte: parseInputDate(from), lte: parseInputDate(to) },
    },
    select: { workerId: true },
  });
  for (const p of pending) {
    if (!out.has(p.workerId!)) out.set(p.workerId!, "has a pending labour payment this month — approve or reject it first");
  }
  return out;
}

/** Employees with a balance due for the month, and why any of them can't be posted yet. */
export async function getPostableWages(actor: Actor, month: string) {
  const sheet = await getWageSheet(actor, month);
  const due = sheet.rows.filter((r) => r.due.isPositive() && !r.due.isZero());
  const problems = await postingProblems(due, month);
  return due.map((r) => ({ row: r, problem: problems.get(r.worker.id) ?? null }));
}

/**
 * Pay the selected employees their balance due for the month: one labour payment (Workers head;
 * "Salaries" for monthly staff, "Daily wages" for daily-rate workers) per employee, charged to their
 * cost center. Amounts are recalculated here, never taken from the browser. Everything is checked
 * before the first payment is saved. Returns the new expense ids.
 */
export async function postWages(
  actor: Actor,
  input: { month: string; date: string; paymentMode: PaymentMode; workerIds: number[] },
) {
  assertCan(actor, "managePayroll");
  const sheet = await getWageSheet(actor, input.month);
  const rows = [...new Set(input.workerIds)].map((id) => {
    const r = sheet.rows.find((x) => x.worker.id === id);
    if (!r) throw new AppError("One of the selected employees is not on this wage sheet. Reload the page.");
    return r;
  });
  const problems = await postingProblems(rows, input.month);
  if (problems.size) {
    const list = rows.filter((r) => problems.has(r.worker.id)).map((r) => `${r.worker.name}: ${problems.get(r.worker.id)}`);
    throw new AppError(`Nothing was posted. ${list.join("; ")}.`);
  }

  const head = await db.expenseHead.findUnique({ where: { name: LABOUR_HEAD }, include: { subheads: true } });
  const sub = (name: string) => {
    const s = head?.subheads.find((x) => x.name === name);
    if (!head?.isActive || !s?.isActive) {
      throw new AppError(`The sub-head "${LABOUR_HEAD} / ${name}" is missing or disabled. Ask the admin to enable it.`);
    }
    return s.id;
  };
  const subheads = { MONTHLY: sub(SALARY_SUBHEAD), DAILY: sub(WAGES_SUBHEAD) };

  const ids: number[] = [];
  for (const r of rows) {
    const [id] = await createExpenses(actor, {
      kind: "labour",
      data: {
        date: input.date,
        projectId: r.costCenter!.id,
        headId: head!.id,
        subheadId: subheads[r.worker.rateType],
        amount: r.due.toFixed(2),
        paymentMode: input.paymentMode,
        chequeNo: null,
        paidTo: r.worker.name,
        vendorId: null,
        workerId: r.worker.id,
        paidFromId: null,
        referenceNo: `WAGES-${input.month}`,
        description:
          r.worker.rateType === "MONTHLY"
            ? `Salary — ${monthLabel(input.month)}`
            : `Wages — ${monthLabel(input.month)} (${r.payableDays} days)`,
        gstAmount: null,
        whtAmount: null,
      },
    });
    ids.push(id);
  }
  return ids;
}
