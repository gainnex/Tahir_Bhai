import { Prisma, type ClientBill, type ClientReceipt } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { formatDate, parseInputDate } from "@/lib/format";
import { filtersToQuery, PERIOD_LABELS, REPORTS, type Report, type ReportFilters } from "@/lib/reports";
import type {
  BillPaymentState,
  BillStatus,
  ClientBillInput,
  ClientReceiptInput,
  VerifyBillInput,
} from "@/lib/validation/billing";
import { PAYMENT_MODE_LABELS } from "@/lib/validation/expenses";
import type { BillDoc, ReceiptDoc } from "@/server/reports/billing-pdf";
import { assertCan, isUniqueError, type Actor } from "@/server/guards";
import { icontains } from "@/server/search";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { COUNTABLE } from "./totals";

// Client billing (changes/changes.pdf §6 "client invoices / running bills per project and receipts
// generation against them (receivables)", §7 "project profitability: contract value / claim billing
// vs verified approved bill"). A bill is claimed, then verified by the client at an approved amount
// (≤ claimed); receipts are recorded against verified bills only, and each receipt's amount plus the
// tax the client deducted is credited to the bill. Admin / Accountant only.

type Tx = Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

type BillLike = Pick<ClientBill, "status" | "claimedAmount" | "approvedAmount">;
type ReceiptLike = Pick<ClientReceipt, "amount" | "taxDeducted">;

/** Received cash + tax deducted by the client, and what is still owed on a bill. */
export function billTotals(bill: BillLike, receipts: ReceiptLike[]) {
  const received = receipts.reduce((s, r) => s.plus(r.amount), ZERO);
  const taxDeducted = receipts.reduce((s, r) => s.plus(r.taxDeducted ?? ZERO), ZERO);
  const credited = received.plus(taxDeducted);
  const approved = bill.status === "VERIFIED" ? (bill.approvedAmount ?? ZERO) : null;
  const outstanding = approved ? approved.minus(credited) : null;
  const state: BillPaymentState = !approved
    ? "AWAITING_VERIFICATION"
    : credited.isZero()
      ? "UNPAID"
      : outstanding!.lte(0)
        ? "PAID"
        : "PART_PAID";
  return { received, taxDeducted, credited, approved, outstanding, state };
}

const liveReceipts = { where: { deletedAt: null }, orderBy: [{ date: "asc" as const }, { id: "asc" as const }] };

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type BillFilters = { projectId?: number; status?: BillStatus; q?: string };

export async function listBills(actor: Actor, f: BillFilters = {}) {
  assertCan(actor, "manageBilling");
  const bills = await db.clientBill.findMany({
    where: {
      deletedAt: null,
      ...(f.projectId ? { projectId: f.projectId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.q
        ? {
            OR: [
              { billNo: icontains(f.q) },
              { clientRef: icontains(f.q) },
              { description: icontains(f.q) },
            ],
          }
        : {}),
    },
    include: { project: { select: { id: true, code: true, name: true, clientName: true } }, receipts: liveReceipts },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
  const rows = bills.map((b) => ({ ...b, totals: billTotals(b, b.receipts) }));
  const sum = (get: (r: (typeof rows)[number]) => Prisma.Decimal | null) => rows.reduce((s, r) => s.plus(get(r) ?? ZERO), ZERO);
  return {
    rows,
    claimed: sum((r) => r.claimedAmount),
    approved: sum((r) => r.totals.approved),
    credited: sum((r) => r.totals.credited),
    outstanding: sum((r) => (r.totals.outstanding?.isPositive() ? r.totals.outstanding : null)),
    awaiting: rows.filter((r) => r.status === "CLAIMED"),
  };
}

export async function getBill(actor: Actor, id: number) {
  assertCan(actor, "manageBilling");
  const bill = await db.clientBill.findFirst({
    where: { id, deletedAt: null },
    include: {
      project: { select: { id: true, code: true, name: true, clientName: true, location: true, budget: true } },
      receipts: { ...liveReceipts, include: { createdBy: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!bill) throw new NotFoundError("Bill");
  const history = await db.activityLog.findMany({
    where: {
      OR: [
        { entityType: "client_bill", entityId: id },
        { entityType: "client_receipt", entityId: { in: bill.receipts.map((r) => r.id) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });
  return { bill, totals: billTotals(bill, bill.receipts), history };
}

/** Receipt with its bill, for editing and for the printable receipt. */
export async function getReceipt(actor: Actor, id: number) {
  assertCan(actor, "manageBilling");
  const receipt = await db.clientReceipt.findFirst({
    where: { id, deletedAt: null, bill: { deletedAt: null } },
    include: {
      bill: { include: { project: { select: { code: true, name: true, clientName: true } }, receipts: liveReceipts } },
      createdBy: { select: { name: true } },
    },
  });
  if (!receipt) throw new NotFoundError("Receipt");
  return { receipt, totals: billTotals(receipt.bill, receipt.bill.receipts) };
}

/** Projects a bill can be raised for: client projects (not Head Office / sub offices). */
export async function billableProjects(currentId?: number) {
  return db.project.findMany({
    where: {
      deletedAt: null,
      OR: [{ isHeadOffice: false, isSubOffice: false }, ...(currentId ? [{ id: currentId }] : [])],
    },
    select: { id: true, code: true, name: true, clientName: true },
    orderBy: { code: "asc" },
  });
}

/** Billing totals for one project (profile page). */
export async function projectBilling(projectId: number) {
  const bills = await db.clientBill.findMany({
    where: { projectId, deletedAt: null },
    include: { receipts: liveReceipts },
  });
  const totals = bills.map((b) => billTotals(b, b.receipts));
  return {
    count: bills.length,
    claimed: bills.reduce((s, b) => s.plus(b.claimedAmount), ZERO),
    approved: totals.reduce((s, t) => s.plus(t.approved ?? ZERO), ZERO),
    credited: totals.reduce((s, t) => s.plus(t.credited), ZERO),
    outstanding: totals.reduce((s, t) => s.plus(t.outstanding?.isPositive() ? t.outstanding : ZERO), ZERO),
  };
}

/** Receivables due on verified bills (dashboard). */
export async function receivablesDue() {
  const bills = await db.clientBill.findMany({
    where: { deletedAt: null, status: "VERIFIED" },
    include: { receipts: liveReceipts },
  });
  let total = ZERO;
  let count = 0;
  for (const b of bills) {
    const o = billTotals(b, b.receipts).outstanding;
    if (o?.isPositive()) {
      total = total.plus(o);
      count += 1;
    }
  }
  const awaiting = await db.clientBill.count({ where: { deletedAt: null, status: "CLAIMED" } });
  return { total, count, awaiting };
}

// ---------------------------------------------------------------------------
// Numbering
// ---------------------------------------------------------------------------

/** "BIL-2026-00007" / "RCT-2026-00007" — sequence per (Pakistan) calendar year, never reused. */
async function nextNumber(prefix: "BIL" | "RCT", tx: Tx) {
  const year = new Date(Date.now() + 5 * 3600_000).getUTCFullYear();
  const p = `${prefix}-${year}-`;
  const last =
    prefix === "BIL"
      ? (await tx.clientBill.findFirst({ where: { billNo: { startsWith: p } }, orderBy: { billNo: "desc" } }))?.billNo
      : (await tx.clientReceipt.findFirst({ where: { receiptNo: { startsWith: p } }, orderBy: { receiptNo: "desc" } }))
          ?.receiptNo;
  const n = last ? Number(last.slice(p.length)) + 1 : 1;
  return `${p}${String(n).padStart(5, "0")}`;
}

async function withNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt < 5 && (isUniqueError(e, "bill_no") || isUniqueError(e, "receipt_no") || isUniqueError(e, "No"))) continue;
      throw e;
    }
  }
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

async function loadBill(id: number) {
  const bill = await db.clientBill.findFirst({ where: { id, deletedAt: null }, include: { receipts: liveReceipts } });
  if (!bill) throw new NotFoundError("Bill");
  return bill;
}

async function validateProject(projectId: number, existingId?: number) {
  const p = await db.project.findFirst({ where: { id: projectId, deletedAt: null } });
  if (!p) throw new AppError("The selected project does not exist.");
  if ((p.isHeadOffice || p.isSubOffice) && projectId !== existingId) {
    throw new AppError("Bills are raised for client projects, not for Head Office or sub offices.");
  }
}

function billData(input: ClientBillInput) {
  return {
    projectId: input.projectId,
    date: parseInputDate(input.date),
    clientRef: input.clientRef,
    description: input.description,
    claimedAmount: new Prisma.Decimal(input.claimedAmount),
  };
}

export async function createBill(actor: Actor, input: ClientBillInput) {
  assertCan(actor, "manageBilling");
  await validateProject(input.projectId);
  return withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const bill = await tx.clientBill.create({
        data: { ...billData(input), billNo: await nextNumber("BIL", tx), createdById: actor.id },
      });
      await logActivity(
        { userId: actor.id, action: "CREATE", entityType: "client_bill", entityId: bill.id, changes: snapshot(bill) },
        tx,
      );
      return bill;
    }),
  );
}

export async function updateBill(actor: Actor, id: number, input: ClientBillInput) {
  assertCan(actor, "manageBilling");
  const before = await loadBill(id);
  await validateProject(input.projectId, before.projectId);
  const data = billData(input);
  if (before.receipts.length && data.projectId !== before.projectId) {
    throw new AppError("This bill has receipts, so it cannot be moved to another project.");
  }
  if (before.approvedAmount && data.claimedAmount.lt(before.approvedAmount)) {
    throw new AppError("The claimed amount cannot be less than the approved amount.");
  }
  await db.$transaction(async (tx) => {
    await tx.clientBill.update({ where: { id }, data });
    const changes = diffChanges(before, data);
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "client_bill", entityId: id, changes }, tx);
    }
  });
}

/** Record (or correct) the client's verification: the approved amount, never more than claimed. */
export async function verifyBill(actor: Actor, id: number, input: VerifyBillInput) {
  assertCan(actor, "manageBilling");
  const before = await loadBill(id);
  const approved = new Prisma.Decimal(input.approvedAmount);
  if (approved.gt(before.claimedAmount)) throw new AppError("The approved amount cannot be more than the claimed amount.");
  const verifiedDate = parseInputDate(input.verifiedDate);
  if (verifiedDate < before.date) throw new AppError("The verification date cannot be before the bill date.");
  const { credited } = billTotals(before, before.receipts);
  if (approved.lt(credited)) {
    throw new AppError(`Receipts of ${credited.toFixed(2)} are already recorded — the approved amount cannot be lower.`);
  }
  const data = { status: "VERIFIED" as const, approvedAmount: approved, verifiedDate, verificationNote: input.verificationNote };
  await db.$transaction(async (tx) => {
    await tx.clientBill.update({ where: { id }, data });
    await logActivity(
      {
        userId: actor.id,
        action: before.status === "VERIFIED" ? "UPDATE" : "APPROVE",
        entityType: "client_bill",
        entityId: id,
        changes: diffChanges(before, data),
      },
      tx,
    );
  });
}

/** Back to "claimed" (e.g. verification entered by mistake). Not once money has been received. */
export async function unverifyBill(actor: Actor, id: number) {
  assertCan(actor, "manageBilling");
  const before = await loadBill(id);
  if (before.status !== "VERIFIED") throw new AppError("This bill is not verified.");
  if (before.receipts.length) throw new AppError("This bill has receipts. Delete them first.");
  const data = { status: "CLAIMED" as const, approvedAmount: null, verifiedDate: null, verificationNote: null };
  await db.$transaction(async (tx) => {
    await tx.clientBill.update({ where: { id }, data });
    await logActivity(
      { userId: actor.id, action: "UPDATE", entityType: "client_bill", entityId: id, changes: diffChanges(before, data) },
      tx,
    );
  });
}

/** Soft delete; only bills without receipts. */
export async function deleteBill(actor: Actor, id: number) {
  assertCan(actor, "manageBilling");
  const bill = await loadBill(id);
  if (bill.receipts.length) throw new AppError("This bill has receipts. Delete them first.");
  await db.$transaction(async (tx) => {
    await tx.clientBill.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "client_bill", entityId: id, changes: snapshot(bill, ["receipts"]) },
      tx,
    );
  });
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

function receiptData(input: ClientReceiptInput) {
  return {
    date: parseInputDate(input.date),
    amount: new Prisma.Decimal(input.amount),
    taxDeducted: input.taxDeducted && new Prisma.Decimal(input.taxDeducted).gt(0) ? new Prisma.Decimal(input.taxDeducted) : null,
    paymentMode: input.paymentMode,
    referenceNo: input.referenceNo,
    notes: input.notes,
  };
}

/** Receipts only on verified bills, dated on/after the bill, and never crediting more than approved. */
function checkReceipt(bill: Awaited<ReturnType<typeof loadBill>>, data: ReturnType<typeof receiptData>, exceptId?: number) {
  if (bill.status !== "VERIFIED") throw new AppError("Record the client's verified amount before receiving money against this bill.");
  if (data.date < bill.date) throw new AppError("The receipt date cannot be before the bill date.");
  const others = billTotals(bill, bill.receipts.filter((r) => r.id !== exceptId)).credited;
  const after = others.plus(data.amount).plus(data.taxDeducted ?? ZERO);
  if (after.gt(bill.approvedAmount!)) {
    const left = bill.approvedAmount!.minus(others);
    throw new AppError(`Only ${left.toFixed(2)} is outstanding on ${bill.billNo} (received + tax deducted cannot exceed the approved amount).`);
  }
}

export async function createReceipt(actor: Actor, billId: number, input: ClientReceiptInput) {
  assertCan(actor, "manageBilling");
  const bill = await loadBill(billId);
  const data = receiptData(input);
  checkReceipt(bill, data);
  return withNumberRetry(() =>
    db.$transaction(async (tx) => {
      const r = await tx.clientReceipt.create({
        data: { ...data, billId, receiptNo: await nextNumber("RCT", tx), createdById: actor.id },
      });
      await logActivity(
        { userId: actor.id, action: "CREATE", entityType: "client_receipt", entityId: r.id, changes: snapshot(r) },
        tx,
      );
      return r;
    }),
  );
}

export async function updateReceipt(actor: Actor, id: number, input: ClientReceiptInput) {
  assertCan(actor, "manageBilling");
  const before = await db.clientReceipt.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("Receipt");
  const bill = await loadBill(before.billId);
  const data = receiptData(input);
  checkReceipt(bill, data, id);
  await db.$transaction(async (tx) => {
    await tx.clientReceipt.update({ where: { id }, data });
    const changes = diffChanges(before, data);
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "client_receipt", entityId: id, changes }, tx);
    }
  });
  return before.billId;
}

/** Soft delete. Returns the bill id. */
export async function deleteReceipt(actor: Actor, id: number) {
  assertCan(actor, "manageBilling");
  const r = await db.clientReceipt.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw new NotFoundError("Receipt");
  await db.$transaction(async (tx) => {
    await tx.clientReceipt.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity({ userId: actor.id, action: "DELETE", entityType: "client_receipt", entityId: id, changes: snapshot(r) }, tx);
  });
  return r.billId;
}

// ---------------------------------------------------------------------------
// Project profitability report
// ---------------------------------------------------------------------------

/**
 * Per client project: contract value, claimed vs verified (approved) billing, money received,
 * receivable, cost (approved expenses) and margin = approved billing − cost. Head Office and sub
 * office costs are shown separately as overheads. Dates filter bills by bill date and costs by
 * expense date.
 */
export async function profitabilityReport(actor: Actor, f: ReportFilters): Promise<Report> {
  assertCan(actor, "manageBilling");
  const range = {
    ...(f.from ? { gte: parseInputDate(f.from) } : {}),
    ...(f.to ? { lte: parseInputDate(f.to) } : {}),
  };
  const projects = await db.project.findMany({
    where: { deletedAt: null, ...(f.projectId ? { id: f.projectId } : {}) },
    select: { id: true, code: true, name: true, clientName: true, budget: true, isHeadOffice: true, isSubOffice: true },
    orderBy: [{ isHeadOffice: "desc" }, { isSubOffice: "desc" }, { code: "asc" }],
  });
  const ids = projects.map((p) => p.id);
  const [bills, costs] = await Promise.all([
    db.clientBill.findMany({ where: { deletedAt: null, projectId: { in: ids }, date: range }, include: { receipts: liveReceipts } }),
    db.expense.groupBy({
      by: ["projectId"],
      where: {
        AND: [
          { deletedAt: null, projectId: { in: ids }, date: range },
          f.includePending ? { status: { in: ["APPROVED", "PENDING"] } } : COUNTABLE,
        ],
      },
      _sum: { amount: true },
    }),
  ]);
  const costBy = new Map(costs.map((c) => [c.projectId, c._sum.amount ?? ZERO]));
  const money = (d: Prisma.Decimal | null) => (d ? d.toFixed(2) : null);
  const pct = (part: Prisma.Decimal, whole: Prisma.Decimal) =>
    whole.isZero() ? null : part.div(whole).mul(100).toDecimalPlaces(1).toNumber();

  const clientProjects = projects.filter((p) => !p.isHeadOffice && !p.isSubOffice);
  const offices = projects.filter((p) => p.isHeadOffice || p.isSubOffice);
  const t = { contract: ZERO, claimed: ZERO, approved: ZERO, credited: ZERO, outstanding: ZERO, cost: ZERO };
  const rows = clientProjects.map((p) => {
    const mine = bills.filter((b) => b.projectId === p.id);
    const totals = mine.map((b) => billTotals(b, b.receipts));
    const claimed = mine.reduce((s, b) => s.plus(b.claimedAmount), ZERO);
    const approved = totals.reduce((s, x) => s.plus(x.approved ?? ZERO), ZERO);
    const credited = totals.reduce((s, x) => s.plus(x.credited), ZERO);
    const outstanding = totals.reduce((s, x) => s.plus(x.outstanding?.isPositive() ? x.outstanding : ZERO), ZERO);
    const cost = costBy.get(p.id) ?? ZERO;
    const margin = approved.minus(cost);
    t.contract = t.contract.plus(p.budget ?? ZERO);
    t.claimed = t.claimed.plus(claimed);
    t.approved = t.approved.plus(approved);
    t.credited = t.credited.plus(credited);
    t.outstanding = t.outstanding.plus(outstanding);
    t.cost = t.cost.plus(cost);
    return {
      cells: {
        project: `${p.code} — ${p.name}${p.clientName ? ` (${p.clientName})` : ""}`,
        contract: money(p.budget),
        claimed: money(claimed),
        approved: money(approved),
        received: money(credited),
        outstanding: money(outstanding),
        cost: money(cost),
        margin: money(margin),
        marginPct: pct(margin, approved),
      },
      links: {
        project: `/projects/${p.id}`,
        approved: `/billing?projectId=${p.id}`,
        cost: `/reports/project-ledger?${filtersToQuery({ ...f, projectId: p.id })}`,
      },
    };
  });
  const margin = t.approved.minus(t.cost);
  const overheads = offices.map((o) => ({
    cells: { office: `${o.code} — ${o.name}`, kind: o.isHeadOffice ? "Head office" : "Sub office", cost: money(costBy.get(o.id) ?? ZERO) },
    links: { office: `/projects/${o.id}` },
  }));
  const overheadTotal = offices.reduce((s, o) => s.plus(costBy.get(o.id) ?? ZERO), ZERO);

  const period =
    f.period === "custom"
      ? `${f.from ? formatDate(f.from) : "…"} to ${f.to ? formatDate(f.to) : "…"}`
      : PERIOD_LABELS[f.period];
  return {
    slug: "profitability",
    title: REPORTS.profitability.title,
    subtitle: [period, f.includePending ? "Costs incl. pending expenses" : "Approved expenses only", "Margin = verified billing − cost"].join(" · "),
    landscape: true,
    tables: [
      {
        title: "Client projects",
        columns: [
          { key: "project", label: "Project (client)", type: "text", wide: true },
          { key: "contract", label: "Contract value", type: "money" },
          { key: "claimed", label: "Claimed", type: "money" },
          { key: "approved", label: "Verified", type: "money" },
          { key: "received", label: "Received", type: "money" },
          { key: "outstanding", label: "Receivable", type: "money" },
          { key: "cost", label: "Cost", type: "money" },
          { key: "margin", label: "Margin", type: "money" },
          { key: "marginPct", label: "Margin %", type: "percent" },
        ],
        rows,
        totals: {
          project: "Total",
          contract: money(t.contract),
          claimed: money(t.claimed),
          approved: money(t.approved),
          received: money(t.credited),
          outstanding: money(t.outstanding),
          cost: money(t.cost),
          margin: money(margin),
          marginPct: pct(margin, t.approved),
        },
        empty: "No client projects.",
      },
      ...(offices.length
        ? [
            {
              title: "Overheads (not charged to projects)",
              columns: [
                { key: "office", label: "Cost center", type: "text" as const, wide: true },
                { key: "kind", label: "Type", type: "text" as const },
                { key: "cost", label: "Cost", type: "money" as const },
              ],
              rows: overheads,
              totals: { office: "Total overheads", cost: money(overheadTotal) },
            },
            {
              title: "Company result",
              columns: [
                { key: "label", label: "", type: "text" as const, wide: true },
                { key: "amount", label: "Amount", type: "money" as const },
              ],
              rows: [
                { cells: { label: "Margin on client projects", amount: money(margin) } },
                { cells: { label: "Less overheads", amount: money(overheadTotal.negated()) } },
                { cells: { label: "Net after overheads", amount: money(margin.minus(overheadTotal)) }, emphasis: true },
              ],
            },
          ]
        : []),
    ],
  };
}

// ---------------------------------------------------------------------------
// Printable documents
// ---------------------------------------------------------------------------

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function receiptDocument(actor: Actor, id: number): Promise<ReceiptDoc> {
  const { receipt: r, totals } = await getReceipt(actor, id);
  // Position as at this receipt: receipts up to and including it
  const upTo = r.bill.receipts.filter((x) => x.date < r.date || (x.date.getTime() === r.date.getTime() && x.id <= r.id));
  const asAt = billTotals(r.bill, upTo);
  return {
    receiptNo: r.receiptNo,
    date: iso(r.date),
    client: r.bill.project.clientName ?? r.bill.project.name,
    project: `${r.bill.project.code} — ${r.bill.project.name}`,
    billNo: r.bill.billNo,
    clientRef: r.bill.clientRef,
    amount: r.amount.toFixed(2),
    taxDeducted: r.taxDeducted ? r.taxDeducted.toFixed(2) : null,
    paymentMode: PAYMENT_MODE_LABELS[r.paymentMode],
    referenceNo: r.referenceNo,
    notes: r.notes,
    approved: (totals.approved ?? ZERO).toFixed(2),
    creditedToDate: asAt.credited.toFixed(2),
    outstanding: (asAt.outstanding ?? ZERO).toFixed(2),
  };
}

export async function billDocument(actor: Actor, id: number): Promise<BillDoc> {
  const { bill } = await getBill(actor, id);
  const earlier = await db.clientBill.aggregate({
    where: {
      projectId: bill.projectId,
      deletedAt: null,
      OR: [{ date: { lt: bill.date } }, { date: bill.date, id: { lt: bill.id } }],
    },
    _sum: { claimedAmount: true },
  });
  return {
    billNo: bill.billNo,
    date: iso(bill.date),
    client: bill.project.clientName ?? bill.project.name,
    project: `${bill.project.code} — ${bill.project.name}`,
    location: bill.project.location,
    clientRef: bill.clientRef,
    description: bill.description,
    claimed: bill.claimedAmount.toFixed(2),
    contractValue: bill.project.budget ? bill.project.budget.toFixed(2) : null,
    previousClaims: (earlier._sum.claimedAmount ?? ZERO).toFixed(2),
  };
}
