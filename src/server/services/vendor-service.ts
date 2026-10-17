import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, NotFoundError } from "@/lib/errors";
import type { VendorInput, VendorType } from "@/lib/validation/parties";
import { assertCan, type Actor } from "@/server/guards";
import { icontains } from "@/server/search";
import { diffChanges, logActivity, snapshot } from "./activity-log";
import { COUNTABLE } from "./totals";

// Vendors / payees (docs/FEATURES.md §4). Managed and viewed by Admin + Accountant.

const ZERO = new Prisma.Decimal(0);

export const expenseRowInclude = {
  project: { select: { id: true, code: true, name: true } },
  head: { select: { name: true } },
  subhead: { select: { name: true } },
} satisfies Prisma.ExpenseInclude;

export async function listVendors(actor: Actor, filters: { q?: string; type?: VendorType } = {}) {
  assertCan(actor, "manageVendors");
  const q = filters.q?.trim();
  const vendors = await db.vendor.findMany({
    where: {
      deletedAt: null,
      ...(filters.type ? { type: filters.type } : {}),
      ...(q ? { OR: [{ name: icontains(q) }, { phone: icontains(q) }, { ntn: icontains(q) }] } : {}),
    },
    orderBy: { name: "asc" },
  });
  const totals = await db.expense.groupBy({
    by: ["vendorId"],
    where: { ...COUNTABLE, vendorId: { in: vendors.map((v) => v.id) } },
    _sum: { amount: true },
    _count: true,
  });
  const byId = new Map(totals.map((t) => [t.vendorId, t]));
  return vendors.map((v) => ({
    ...v,
    totalPaid: byId.get(v.id)?._sum.amount ?? ZERO,
    paymentCount: byId.get(v.id)?._count ?? 0,
  }));
}

export async function getVendorProfile(actor: Actor, id: number) {
  assertCan(actor, "manageVendors");
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null } });
  if (!vendor) throw new NotFoundError("Vendor");

  const [approved, pending, entries, entryCount] = await Promise.all([
    db.expense.aggregate({ where: { ...COUNTABLE, vendorId: id }, _sum: { amount: true }, _count: true }),
    db.expense.aggregate({
      where: { status: "PENDING", deletedAt: null, vendorId: id },
      _sum: { amount: true },
      _count: true,
    }),
    db.expense.findMany({
      where: { vendorId: id, deletedAt: null },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 100,
      include: expenseRowInclude,
    }),
    db.expense.count({ where: { vendorId: id, deletedAt: null } }),
  ]);

  return {
    vendor,
    totalPaid: approved._sum.amount ?? ZERO,
    approvedCount: approved._count,
    pendingAmount: pending._sum.amount ?? ZERO,
    pendingCount: pending._count,
    entries,
    entryCount,
  };
}

export async function getVendorForEdit(actor: Actor, id: number) {
  assertCan(actor, "manageVendors");
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null } });
  if (!vendor) throw new NotFoundError("Vendor");
  return vendor;
}

/** Picker options for the expense form (any logged-in user). */
export async function listVendorOptions() {
  return db.vendor.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
}

export async function createVendor(actor: Actor, input: VendorInput) {
  assertCan(actor, "manageVendors");
  return db.$transaction(async (tx) => {
    const vendor = await tx.vendor.create({ data: input });
    await logActivity(
      { userId: actor.id, action: "CREATE", entityType: "vendor", entityId: vendor.id, changes: snapshot(vendor) },
      tx,
    );
    return vendor;
  });
}

export async function updateVendor(actor: Actor, id: number, input: VendorInput) {
  assertCan(actor, "manageVendors");
  const before = await db.vendor.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw new NotFoundError("Vendor");
  await db.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: input });
    const changes = diffChanges(before, input);
    if (Object.keys(changes).length) {
      await logActivity({ userId: actor.id, action: "UPDATE", entityType: "vendor", entityId: id, changes }, tx);
    }
  });
}

/** Soft delete; refused while expenses reference the vendor (reports must keep the name). */
export async function deleteVendor(actor: Actor, id: number) {
  assertCan(actor, "manageVendors");
  const vendor = await db.vendor.findFirst({ where: { id, deletedAt: null } });
  if (!vendor) throw new NotFoundError("Vendor");
  const used = await db.expense.count({ where: { vendorId: id, deletedAt: null } });
  if (used > 0) throw new AppError(`This vendor is used on ${used} expense(s) and cannot be deleted.`);
  await db.$transaction(async (tx) => {
    await tx.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(
      { userId: actor.id, action: "DELETE", entityType: "vendor", entityId: id, changes: snapshot(vendor) },
      tx,
    );
  });
}
