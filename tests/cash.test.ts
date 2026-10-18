import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { cashEntrySchema, type CashEntryInput } from "@/lib/validation/cash";
import type { ExpenseInput } from "@/lib/validation/expenses";
import { workerSchema } from "@/lib/validation/parties";
import * as cash from "@/server/services/cash-service";
import * as exp from "@/server/services/expense-service";
import * as projects from "@/server/services/project-service";
import * as workers from "@/server/services/worker-service";
import { admin, makeUser } from "./helpers";

// Employee cash in hand (changes/changes.pdf §1).

type Actor = Awaited<ReturnType<typeof makeUser>>;
let acc: Actor, site: Actor, otherSite: Actor;
let projectId: number;
let materials: { id: number; sub: number };

let n = 0;
async function employee(extra: { userId?: number | null; employeeType?: "LABOUR" | "PERMANENT" | "PART_TIME" } = {}) {
  n += 1;
  const w = await workers.createWorker(await admin(), {
    name: `Cash employee ${n}`,
    cnic: null,
    phone: null,
    employeeType: extra.employeeType ?? "PERMANENT",
    designation: "Supervisor",
    trade: "OTHER",
    rateType: "MONTHLY",
    rate: "50000",
    defaultProjectId: null,
    userId: extra.userId ?? null,
    isActive: true,
  });
  return w.id;
}

const entry = (workerId: number, extra: Partial<CashEntryInput> = {}): CashEntryInput => ({
  date: "2026-09-01",
  workerId,
  type: "ISSUED",
  amount: "10000",
  paymentMode: "CASH",
  projectId: null,
  referenceNo: null,
  notes: null,
  ...extra,
});

const expense = (paidFromId: number | null, extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  date: "2026-09-05",
  projectId,
  headId: materials.id,
  subheadId: materials.sub,
  amount: "1500",
  paymentMode: "CASH",
  chequeNo: null,
  paidTo: "Hardware shop",
  vendorId: null,
  workerId: null,
  paidFromId,
  referenceNo: null,
  description: "Nails",
  ...extra,
});

async function balanceOf(workerId: number) {
  return (await cash.cashBalances([workerId])).get(workerId);
}

beforeAll(async () => {
  acc = await makeUser("ACCOUNTANT");
  site = await makeUser("SITE_INCHARGE");
  otherSite = await makeUser("SITE_INCHARGE");
  const p = await projects.createProject(await admin(), {
    code: `CASH-${Date.now()}`,
    name: "Cash test",
    clientName: null,
    projectManager: null,
    location: null,
    startDate: "2026-01-01",
    endDate: null,
    status: "ACTIVE",
    budget: null,
    notes: null,
    siteInchargeIds: [site.id, otherSite.id],
  });
  projectId = p!.id;
  const head = await db.expenseHead.findFirstOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
  materials = { id: head.id, sub: head.subheads[0].id };
});

describe("cash entry validation", () => {
  it("requires an employee, a positive amount and a known type", () => {
    const r = cashEntrySchema.safeParse({ date: "2026-09-01", type: "GIFT", amount: "0", paymentMode: "CASH" });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["workerId", "type", "amount"]));
  });

  it("accepts amounts with commas", () => {
    const r = cashEntrySchema.parse({ date: "2026-09-01", workerId: "3", type: "OPENING", amount: "1,25,000", paymentMode: "ONLINE_TRANSFER" });
    expect(r.amount).toBe("125000");
    expect(r.projectId).toBeNull();
  });

  it("worker schema accepts the employee fields", () => {
    const w = workerSchema.parse({ name: "A", trade: "OTHER", rateType: "MONTHLY", rate: "1", employeeType: "PART_TIME", designation: " Clerk ", userId: "" });
    expect(w).toMatchObject({ employeeType: "PART_TIME", designation: "Clerk", userId: null });
  });
});

describe("balance", () => {
  it("is opening + given − returned − approved spending; pending is shown separately", async () => {
    const w = await employee();
    await cash.createCashEntry(acc, entry(w, { type: "OPENING", amount: "2500" }));
    await cash.createCashEntry(acc, entry(w, { amount: "20000", paymentMode: "ONLINE_TRANSFER" }));
    await cash.createCashEntry(acc, entry(w, { type: "RETURNED", amount: "1000" }));
    await exp.createExpenses(acc, { kind: "single", data: expense(w, { amount: "3000.50" }) }); // auto-approved
    await exp.createExpenses(site, { kind: "single", data: expense(null, { amount: "999" }) }); // not from this cash

    const b = await balanceOf(w);
    expect(b!.opening.toString()).toBe("2500");
    expect(b!.issued.toString()).toBe("20000");
    expect(b!.returned.toString()).toBe("1000");
    expect(b!.spent.toString()).toBe("3000.5");
    expect(b!.balance.toString()).toBe("18499.5");

    // A site in-charge linked to a different employee can't spend this cash…
    await expect(exp.createExpenses(site, { kind: "single", data: expense(w) })).rejects.toThrow(ForbiddenError);
  });

  it("counts a site in-charge's own expense only once approved, and drops it when rejected or deleted", async () => {
    const w = await employee({ userId: site.id });
    await cash.createCashEntry(acc, entry(w, { amount: "5000" }));
    const [pendingId] = await exp.createExpenses(site, { kind: "single", data: expense(w, { amount: "1200" }) });

    let b = await balanceOf(w);
    expect(b!.balance.toString()).toBe("5000");
    expect(b!.pendingSpent.toString()).toBe("1200");
    expect(b!.pendingCount).toBe(1);

    await exp.approveExpense(acc, pendingId);
    b = await balanceOf(w);
    expect(b!.balance.toString()).toBe("3800");
    expect(b!.pendingCount).toBe(0);

    const [rejectId] = await exp.createExpenses(site, { kind: "single", data: expense(w, { amount: "700" }) });
    await exp.rejectExpense(acc, rejectId, "No receipt");
    expect((await balanceOf(w))!.balance.toString()).toBe("3800");

    await exp.deleteExpense(await admin(), pendingId);
    expect((await balanceOf(w))!.balance.toString()).toBe("5000");
  });

  it("goes negative when the employee spends more than they were given", async () => {
    const w = await employee();
    await cash.createCashEntry(acc, entry(w, { amount: "1000" }));
    await exp.createExpenses(acc, { kind: "single", data: expense(w, { amount: "1600" }) });
    const b = await balanceOf(w);
    expect(b!.balance.toString()).toBe("-600");
    const totals = await cash.totalCashWithEmployees();
    expect(totals.owed.greaterThanOrEqualTo(600)).toBe(true);
  });

  it("split bills paid from cash take every line off the balance", async () => {
    const w = await employee();
    await cash.createCashEntry(acc, entry(w, { amount: "10000" }));
    await exp.createExpenses(acc, {
      kind: "split",
      data: {
        ...expense(w),
        billTotal: "3000",
        lines: [
          { projectId, headId: materials.id, subheadId: materials.sub, amount: "1000" },
          { projectId, headId: materials.id, subheadId: materials.sub, amount: "2000" },
        ],
      },
    });
    expect((await balanceOf(w))!.balance.toString()).toBe("7000");
  });
});

describe("permissions", () => {
  it("only Admin and Accountant record or change cash entries", async () => {
    const w = await employee({ userId: null });
    await expect(cash.createCashEntry(site, entry(w))).rejects.toThrow(ForbiddenError);
    const e = await cash.createCashEntry(acc, entry(w));
    await expect(cash.updateCashEntry(site, e.id, entry(w))).rejects.toThrow(ForbiddenError);
    await expect(cash.deleteCashEntry(site, e.id)).rejects.toThrow(ForbiddenError);
    await expect(cash.listCashHolders(site)).rejects.toThrow(ForbiddenError);
  });

  it("a site in-charge sees only their own statement", async () => {
    const own = await employee({ userId: otherSite.id });
    const someoneElse = await employee();
    await expect(cash.getCashStatement(otherSite, own)).resolves.toBeTruthy();
    await expect(cash.getCashStatement(otherSite, someoneElse)).rejects.toThrow(ForbiddenError);
  });

  it("the expense form offers a site in-charge only their own cash", async () => {
    const own = await exp.ownEmployeeId(otherSite.id);
    const opts = await exp.getExpenseFormOptions(otherSite);
    expect(opts.ownEmployeeId).toBe(own);
    expect(opts.cashHolders.map((h) => h.id)).toEqual([own]);
    const accOpts = await exp.getExpenseFormOptions(acc);
    expect(accOpts.cashHolders.length).toBeGreaterThan(1);
  });

  it("a login can be linked to only one employee", async () => {
    const u = await makeUser("SITE_INCHARGE");
    await employee({ userId: u.id });
    await expect(employee({ userId: u.id })).rejects.toThrow(AppError);
  });

  it("inactive employees can't receive cash or pay expenses", async () => {
    const w = await employee();
    await db.worker.update({ where: { id: w }, data: { isActive: false } });
    await expect(cash.createCashEntry(acc, entry(w))).rejects.toThrow(/inactive/);
    await expect(exp.createExpenses(acc, { kind: "single", data: expense(w) })).rejects.toThrow(/inactive/);
  });

  it("an employee with cash entries can't be deleted", async () => {
    const w = await employee();
    await cash.createCashEntry(acc, entry(w));
    await expect(workers.deleteWorker(acc, w)).rejects.toThrow(/cannot be deleted/);
  });
});

describe("statement", () => {
  it("lists entries and expenses in date order with a running balance and brought-forward", async () => {
    const w = await employee();
    await cash.createCashEntry(acc, entry(w, { date: "2026-08-01", type: "OPENING", amount: "500" }));
    await cash.createCashEntry(acc, entry(w, { date: "2026-09-01", amount: "10000" }));
    await exp.createExpenses(acc, { kind: "single", data: expense(w, { date: "2026-09-01", amount: "400" }) });
    await exp.createExpenses(acc, { kind: "single", data: expense(w, { date: "2026-09-10", amount: "2100" }) });
    await cash.createCashEntry(acc, entry(w, { date: "2026-09-20", type: "RETURNED", amount: "1000" }));

    const all = await cash.getCashStatement(acc, w);
    expect(all.rows.map((r) => [r.number.slice(0, 3), r.balance?.toString()])).toEqual([
      ["CSH", "500"],
      ["CSH", "10500"], // money in comes before money out on the same day
      ["EXP", "10100"],
      ["EXP", "8000"],
      ["CSH", "7000"],
    ]);
    expect(all.closing.toString()).toBe("7000");

    const sept = await cash.getCashStatement(acc, w, { from: "2026-09-05" });
    expect(sept.broughtForward!.toString()).toBe("10100");
    expect(sept.rows).toHaveLength(2);
    expect(sept.closing.toString()).toBe("7000");
  });

  it("logs every create, edit and delete", async () => {
    const w = await employee();
    const e = await cash.createCashEntry(acc, entry(w));
    expect(e.entryNo).toMatch(/^CSH-\d{4}-\d{5}$/);
    await cash.updateCashEntry(acc, e.id, entry(w, { amount: "12000" }));
    await cash.deleteCashEntry(acc, e.id);
    const logs = await db.activityLog.findMany({ where: { entityType: "cash_entry", entityId: e.id }, orderBy: { id: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    expect(logs[1].changes).toMatchObject({ amount: { old: "10000", new: "12000" } });
    expect((await balanceOf(w))?.balance.toString() ?? "0").toBe("0");
  });
});
