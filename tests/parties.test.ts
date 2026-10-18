import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { ForbiddenError } from "@/lib/errors";
import { vendorSchema, workerSchema, type WorkerInput } from "@/lib/validation/parties";
import * as projects from "@/server/services/project-service";
import * as vendors from "@/server/services/vendor-service";
import * as workers from "@/server/services/worker-service";
import { admin, makeUser } from "./helpers";

const workerInput = (extra: Partial<WorkerInput> = {}): WorkerInput => ({
  name: "Test Worker",
  cnic: null,
  phone: null,
  trade: "MASON",
  rateType: "DAILY",
  rate: "1500",
  defaultProjectId: null,
  isActive: true,
  ...extra,
});

let n = 0;
async function newProject(siteInchargeIds: number[] = []) {
  n += 1;
  return (await projects.createProject(await admin(), {
    code: `PT-${Date.now()}-${n}`,
    name: "P",
    clientName: null, projectManager: null,
    location: null,
    startDate: "2026-01-01",
    endDate: null,
    status: "ACTIVE",
    budget: null,
    notes: null,
    siteInchargeIds,
  }))!;
}

async function labourExpense(opts: {
  projectId: number;
  workerId?: number;
  vendorId?: number;
  sub: string;
  amount: string;
  status?: "APPROVED" | "PENDING";
  deleted?: boolean;
}) {
  const head = await db.expenseHead.findUniqueOrThrow({ where: { name: LABOUR_HEAD }, include: { subheads: true } });
  const a = await admin();
  return db.expense.create({
    data: {
      expenseNo: `TST-${Date.now()}-${Math.random()}`,
      date: new Date("2026-03-01"),
      projectId: opts.projectId,
      headId: head.id,
      subheadId: head.subheads.find((s) => s.name === opts.sub)!.id,
      amount: new Prisma.Decimal(opts.amount),
      paymentMode: "CASH",
      paidTo: "x",
      description: "x",
      status: opts.status ?? "APPROVED",
      workerId: opts.workerId,
      vendorId: opts.vendorId,
      createdById: a.id,
      deletedAt: opts.deleted ? new Date() : null,
    },
  });
}

describe("vendor / worker validation", () => {
  it("checks CNIC, phone, NTN and rate", () => {
    const w = (extra: Record<string, unknown>) =>
      workerSchema.safeParse({ name: "A", trade: "MASON", rateType: "DAILY", rate: "1500", defaultProjectId: "", ...extra });
    expect(w({ cnic: "35202-1234567-1" }).success).toBe(true);
    expect(w({ cnic: "3520212345671" }).success).toBe(false);
    expect(w({ rate: "0" }).success).toBe(false);
    expect(w({ rate: "1500.555" }).success).toBe(false);
    expect(w({ phone: "abc" }).success).toBe(false);
    const parsed = workerSchema.parse({ name: "A", trade: "MASON", rateType: "DAILY", rate: "1,500", defaultProjectId: "3", isActive: "on" });
    expect(parsed).toMatchObject({ rate: "1500", defaultProjectId: 3, isActive: true, cnic: null });

    expect(vendorSchema.safeParse({ name: "V", type: "SUPPLIER", ntn: "1234567-8" }).success).toBe(true);
    expect(vendorSchema.safeParse({ name: "V", type: "SUPPLIER", ntn: "ABC" }).success).toBe(false);
    expect(vendorSchema.safeParse({ name: "V", type: "NOPE" }).success).toBe(false);
  });
});

describe("vendors", () => {
  it("are managed by admin/accountant only", async () => {
    const site = await makeUser("SITE_INCHARGE");
    await expect(vendors.listVendors(site)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      vendors.createVendor(site, { name: "X", type: "OTHER", phone: null, ntn: null, address: null, notes: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // …but every user can pick vendors on the expense form
    expect(Array.isArray(await vendors.listVendorOptions())).toBe(true);
  });

  it("totals approved, non-deleted payments; logs changes; delete rules", async () => {
    const acc = await makeUser("ACCOUNTANT");
    const v = await vendors.createVendor(acc, { name: "Steel Co", type: "SUPPLIER", phone: null, ntn: null, address: null, notes: null });
    await vendors.updateVendor(acc, v.id, { name: "Steel Co Ltd", type: "SUPPLIER", phone: "0300-1234567", ntn: null, address: null, notes: null });
    const log = await db.activityLog.findFirst({ where: { entityType: "vendor", entityId: v.id, action: "UPDATE" } });
    expect(log?.changes).toMatchObject({ name: { old: "Steel Co", new: "Steel Co Ltd" } });

    const p = await newProject();
    await labourExpense({ projectId: p.id, vendorId: v.id, sub: "Contractor payments", amount: "1000.50" });
    await labourExpense({ projectId: p.id, vendorId: v.id, sub: "Contractor payments", amount: "500", status: "PENDING" });
    await labourExpense({ projectId: p.id, vendorId: v.id, sub: "Contractor payments", amount: "700", deleted: true });

    const prof = await vendors.getVendorProfile(acc, v.id);
    expect(prof.totalPaid.toFixed(2)).toBe("1000.50");
    expect(prof.pendingAmount.toFixed(2)).toBe("500.00");
    expect(prof.entryCount).toBe(2);
    expect((await vendors.listVendors(acc)).find((x) => x.id === v.id)?.totalPaid.toFixed(2)).toBe("1000.50");

    await expect(vendors.deleteVendor(acc, v.id)).rejects.toThrow("cannot be deleted");
    const unused = await vendors.createVendor(acc, { name: "Unused", type: "OTHER", phone: null, ntn: null, address: null, notes: null });
    await vendors.deleteVendor(acc, unused.id);
    expect((await vendors.listVendorOptions()).some((o) => o.id === unused.id)).toBe(false);
  });
});

describe("workers", () => {
  it("site in-charges can view but not create workers", async () => {
    const site = await makeUser("SITE_INCHARGE");
    await expect(workers.createWorker(site, workerInput())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(workers.listWorkers(site)).resolves.toBeInstanceOf(Array);
  });

  it("separates advances from wages and scopes amounts to the site in-charge's projects", async () => {
    const a = await admin();
    const site = await makeUser("SITE_INCHARGE");
    const mine = await newProject([site.id]);
    const other = await newProject();
    const w = await workers.createWorker(a, workerInput({ defaultProjectId: mine.id }));

    await labourExpense({ projectId: mine.id, workerId: w.id, sub: "Daily wages", amount: "9000" });
    await labourExpense({ projectId: mine.id, workerId: w.id, sub: ADVANCE_SUBHEAD, amount: "2000" });
    await labourExpense({ projectId: other.id, workerId: w.id, sub: "Daily wages", amount: "4000" });
    await labourExpense({ projectId: other.id, workerId: w.id, sub: "Overtime", amount: "100", status: "PENDING" });

    const all = await workers.getWorkerProfile(a, w.id);
    expect(all.totalPaid.toFixed(2)).toBe("15000.00");
    expect(all.advanceTotal.toFixed(2)).toBe("2000.00");
    expect(all.wagesPaid.toFixed(2)).toBe("13000.00");
    expect(all.pendingAmount.toFixed(2)).toBe("100.00");
    expect(all.advances).toHaveLength(1);
    expect(all.payments).toHaveLength(3); // 2 wages + 1 pending overtime; advance listed separately
    expect(all.byProject.find((r) => r.project.id === mine.id)?.wages.toFixed(2)).toBe("9000.00");

    const filtered = await workers.getWorkerProfile(a, w.id, { projectId: other.id });
    expect(filtered.totalPaid.toFixed(2)).toBe("4000.00");

    const siteView = await workers.getWorkerProfile(site, w.id);
    expect(siteView.totalPaid.toFixed(2)).toBe("11000.00"); // only the assigned project
    expect(siteView.projects.map((p) => p.id)).toEqual([mine.id]);
    expect((await workers.listWorkers(site)).find((x) => x.id === w.id)?.totalPaid.toFixed(2)).toBe("11000.00");

    await expect(workers.deleteWorker(a, w.id)).rejects.toThrow("Mark them inactive");
  });

  it("deactivated workers drop out of the payment picker; unused workers can be deleted", async () => {
    const a = await admin();
    const w = await workers.createWorker(a, workerInput({ name: "Temp" }));
    expect((await workers.listWorkerOptions()).some((o) => o.id === w.id)).toBe(true);
    await workers.updateWorker(a, w.id, workerInput({ name: "Temp", isActive: false }));
    expect((await workers.listWorkerOptions()).some((o) => o.id === w.id)).toBe(false);
    await workers.deleteWorker(a, w.id);
    expect((await db.worker.findUnique({ where: { id: w.id } }))?.deletedAt).not.toBeNull();
  });
});
