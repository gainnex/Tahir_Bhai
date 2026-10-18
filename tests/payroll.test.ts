import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { AppError, ForbiddenError } from "@/lib/errors";
import { basicPay, daysInMonth, monthRange, payableDays, shiftMonth } from "@/lib/payroll";
import type { ExpenseInput } from "@/lib/validation/expenses";
import {
  attendanceFromForm,
  attendanceSheetSchema,
  payAdjustmentSchema,
  postWagesSchema,
  type PayAdjustmentInput,
} from "@/lib/validation/payroll";
import { entityHref } from "@/server/services/activity-service";
import { createExpenses } from "@/server/services/expense-service";
import * as payroll from "@/server/services/payroll-service";
import { createProject, listProjectOptions, updateProject } from "@/server/services/project-service";
import { admin, makeUser } from "./helpers";

// Office attendance, benefits / deductions and the wage sheet (changes/changes.pdf §3).

type Actor = Awaited<ReturnType<typeof makeUser>>;
let acc: Actor, site: Actor;
let siteProject: number, otherProject: number, subOffice: number;
let labour: { id: number; wages: number; advance: number };

const MONTH = "2026-07";

let n = 0;
async function worker(extra: { rateType?: "DAILY" | "MONTHLY"; rate?: string; projectId?: number | null; isActive?: boolean } = {}) {
  n += 1;
  return db.worker.create({
    data: {
      name: `Payroll employee ${n}`,
      trade: "OTHER",
      employeeType: extra.rateType === "MONTHLY" ? "PERMANENT" : "LABOUR",
      rateType: extra.rateType ?? "DAILY",
      rate: extra.rate ?? "1000",
      defaultProjectId: extra.projectId ?? null,
      isActive: extra.isActive ?? true,
    },
  });
}

const mark = (date: string, marks: [number, "PRESENT" | "HALF_DAY" | "ABSENT" | "LEAVE" | null][]) => ({
  date,
  marks: marks.map(([workerId, status]) => ({ workerId, status })),
});

const adj = (workerId: number, extra: Partial<PayAdjustmentInput> = {}): PayAdjustmentInput => ({
  date: `${MONTH}-15`,
  workerId,
  type: "BENEFIT",
  amount: "500",
  notes: null,
  ...extra,
});

async function pay(actor: Actor, workerId: number, amount: string, extra: Partial<ExpenseInput> = {}) {
  const [id] = await createExpenses(actor, {
    kind: "labour",
    data: {
      date: `${MONTH}-20`, projectId: siteProject, headId: labour.id, subheadId: labour.wages, amount,
      paymentMode: "CASH", chequeNo: null, paidTo: "Worker", vendorId: null, paidFromId: null,
      referenceNo: null, description: "Wages", gstAmount: null, whtAmount: null,
      ...extra,
      workerId,
    },
  });
  return id;
}

const rowOf = async (workerId: number, month = MONTH) =>
  (await payroll.getWageSheet(acc, month)).rows.find((r) => r.worker.id === workerId)!;

beforeAll(async () => {
  const a = await admin();
  acc = await makeUser("ACCOUNTANT"); // auto-approve is on in the seed
  site = await makeUser("SITE_INCHARGE");
  const mk = async (name: string, siteIds: number[], isSubOffice = false) =>
    (await createProject(a, {
      code: `PY-${Date.now()}-${name}`, name, clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget: null, notes: null, isSubOffice, siteInchargeIds: siteIds,
    }))!.id;
  siteProject = await mk("Site", [site.id]);
  otherProject = await mk("Other", []);
  subOffice = await mk("Lahore office", [], true);
  const l = await db.expenseHead.findUniqueOrThrow({ where: { name: LABOUR_HEAD }, include: { subheads: true } });
  labour = {
    id: l.id,
    wages: l.subheads.find((s) => s.name === "Daily wages")!.id,
    advance: l.subheads.find((s) => s.name === ADVANCE_SUBHEAD)!.id,
  };
});

describe("wage maths", () => {
  it("month helpers", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(monthRange("2026-07")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("daily rate: present days, half days count half, leave unpaid", () => {
    const c = { present: 20, halfDay: 2, absent: 3, leave: 1 };
    expect(basicPay("DAILY", "1500", c, 31)).toBe("31500.00");
    expect(payableDays("DAILY", c, 31)).toBe(21);
    expect(basicPay("DAILY", "1000.01", { present: 0, halfDay: 1, absent: 0, leave: 0 }, 31)).toBe("500.01"); // half-up
  });

  it("monthly rate: full salary less absent days and half days, by days in the month", () => {
    const none = { present: 0, halfDay: 0, absent: 0, leave: 0 };
    expect(basicPay("MONTHLY", "30000", none, 31)).toBe("30000.00"); // unmarked days are paid
    expect(basicPay("MONTHLY", "31000", { ...none, absent: 1, leave: 2 }, 31)).toBe("30000.00");
    expect(basicPay("MONTHLY", "30000", { ...none, absent: 2, halfDay: 1 }, 31)).toBe("27580.65");
    expect(basicPay("MONTHLY", "30000", { ...none, absent: 40 }, 31)).toBe("0.00");
  });
});

describe("attendance", () => {
  it("reads the sheet form (status_<id> fields)", () => {
    const fd = new FormData();
    fd.append("date", "2026-07-01");
    fd.append("status_12", "PRESENT");
    fd.append("status_13", "");
    const parsed = attendanceSheetSchema.parse(attendanceFromForm(fd));
    expect(parsed.marks).toEqual([
      { workerId: 12, status: "PRESENT" },
      { workerId: 13, status: null },
    ]);
  });

  it("marks, changes and clears a day; every change is logged", async () => {
    const w = await worker();
    expect(await payroll.saveAttendance(acc, mark("2026-07-01", [[w.id, "PRESENT"]]))).toBe(1);
    expect(await payroll.saveAttendance(acc, mark("2026-07-01", [[w.id, "PRESENT"]]))).toBe(0); // unchanged
    await payroll.saveAttendance(acc, mark("2026-07-01", [[w.id, "ABSENT"]]));
    expect((await payroll.getAttendanceDay(acc, "2026-07-01")).marks[w.id]).toBe("ABSENT");
    await payroll.saveAttendance(acc, mark("2026-07-01", [[w.id, null]]));
    expect((await payroll.getAttendanceDay(acc, "2026-07-01")).marks[w.id]).toBeUndefined();

    const logs = await db.activityLog.findMany({ where: { entityType: "attendance", entityId: w.id }, orderBy: { id: "asc" } });
    expect(logs.map((l) => l.action)).toEqual(["CREATE", "UPDATE", "DELETE"]);
    expect(entityHref("attendance", w.id)).toBe(`/workers/${w.id}`);
  });

  it("cannot be marked for a future date, or newly for an inactive employee", async () => {
    const w = await worker();
    await expect(payroll.saveAttendance(acc, mark("2999-01-01", [[w.id, "PRESENT"]]))).rejects.toThrow(AppError);
    const gone = await worker({ isActive: false });
    await expect(payroll.saveAttendance(acc, mark("2026-07-02", [[gone.id, "PRESENT"]]))).rejects.toThrow(/inactive/);
  });

  it("a site in-charge marks only employees of their assigned projects", async () => {
    const mine = await worker({ projectId: siteProject });
    const other = await worker({ projectId: otherProject });
    await payroll.saveAttendance(site, mark("2026-07-03", [[mine.id, "PRESENT"]]));
    await expect(payroll.saveAttendance(site, mark("2026-07-03", [[other.id, "PRESENT"]]))).rejects.toThrow(ForbiddenError);
    const ids = (await payroll.getAttendanceDay(site, "2026-07-03")).workers.map((w) => w.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(other.id);
  });

  it("monthly register shows a letter per day and counts", async () => {
    const w = await worker();
    await payroll.saveAttendance(acc, mark("2026-07-05", [[w.id, "PRESENT"]]));
    await payroll.saveAttendance(acc, mark("2026-07-06", [[w.id, "HALF_DAY"]]));
    const reg = await payroll.getAttendanceRegister(acc, MONTH);
    const row = reg.rows.find((r) => r.worker.id === w.id)!;
    expect(reg.days).toBe(31);
    expect(row.codes.slice(4, 7)).toEqual(["P", "H", null]);
    expect(row.counts).toMatchObject({ present: 1, halfDay: 1 });
  });
});

describe("benefits & deductions", () => {
  it("validates input", () => {
    expect(payAdjustmentSchema.safeParse({ date: "2026-07-01", workerId: "1", type: "BONUS", amount: "10" }).success).toBe(false);
    expect(payAdjustmentSchema.safeParse({ date: "2026-07-01", workerId: "1", type: "REWARD", amount: "0" }).success).toBe(false);
  });

  it("only Admin / Accountant record them; numbered, edited and deleted with a log", async () => {
    const w = await worker();
    await expect(payroll.createPayAdjustment(site, adj(w.id))).rejects.toThrow(ForbiddenError);
    const a = await payroll.createPayAdjustment(acc, adj(w.id));
    expect(a.entryNo).toMatch(/^ADJ-\d{4}-\d{5}$/);
    await payroll.updatePayAdjustment(acc, a.id, adj(w.id, { amount: "750" }));
    expect((await payroll.getPayAdjustment(acc, a.id)).amount.toFixed(0)).toBe("750");
    await payroll.deletePayAdjustment(acc, a.id);
    await expect(payroll.getPayAdjustment(acc, a.id)).rejects.toThrow();
    const logs = await db.activityLog.findMany({ where: { entityType: "pay_adjustment", entityId: a.id } });
    expect(logs.map((l) => l.action).sort()).toEqual(["CREATE", "DELETE", "UPDATE"]);
  });
});

describe("wage sheet", () => {
  it("attendance × rate, ± adjustments, less approved payments; advance balance", async () => {
    const w = await worker({ rate: "1000", projectId: siteProject });
    for (const [d, s] of [["01", "PRESENT"], ["02", "PRESENT"], ["03", "PRESENT"], ["04", "HALF_DAY"], ["07", "ABSENT"], ["08", "LEAVE"]] as const) {
      await payroll.saveAttendance(acc, mark(`${MONTH}-${d}`, [[w.id, s]]));
    }
    await payroll.saveAttendance(acc, mark("2026-08-01", [[w.id, "PRESENT"]])); // other month: ignored
    await payroll.createPayAdjustment(acc, adj(w.id, { type: "INCENTIVE", amount: "500" }));
    await payroll.createPayAdjustment(acc, adj(w.id, { type: "DEDUCTION", amount: "200" }));
    await payroll.createPayAdjustment(acc, adj(w.id, { type: "ADVANCE_RECOVERY", amount: "300" }));
    await pay(acc, w.id, "2000");
    await pay(acc, w.id, "1000", { subheadId: labour.advance, date: "2026-06-10" }); // advance, earlier month
    await pay(site, w.id, "999"); // pending: not counted

    const r = await rowOf(w.id);
    expect(r.counts).toEqual({ present: 3, halfDay: 1, absent: 1, leave: 1 });
    expect(r.payableDays).toBe(3.5);
    expect(r.basic.toFixed(2)).toBe("3500.00");
    expect(r.additions.toFixed(2)).toBe("500.00");
    expect(r.deductions.toFixed(2)).toBe("500.00");
    expect(r.net.toFixed(2)).toBe("3500.00");
    expect(r.paid.toFixed(2)).toBe("2000.00");
    expect(r.due.toFixed(2)).toBe("1500.00");
    expect(r.advanceBalance.toFixed(2)).toBe("700.00");

    // Before the recovery month, the whole advance is outstanding
    expect((await rowOf(w.id, "2026-06")).advanceBalance.toFixed(2)).toBe("1000.00");
  });

  it("monthly staff are paid in full unless absent", async () => {
    const w = await worker({ rateType: "MONTHLY", rate: "31000" });
    expect((await rowOf(w.id)).basic.toFixed(2)).toBe("31000.00");
    await payroll.saveAttendance(acc, mark(`${MONTH}-10`, [[w.id, "ABSENT"]]));
    expect((await rowOf(w.id)).basic.toFixed(2)).toBe("30000.00");
  });

  it("is for Admin / Accountant only; the printable report has a signature column", async () => {
    await expect(payroll.getWageSheet(site, MONTH)).rejects.toThrow(ForbiddenError);
    const screen = await payroll.wageSheetReport(acc, MONTH);
    const print = await payroll.wageSheetReport(acc, MONTH, { print: true });
    expect(screen.tables[0].columns.some((c) => c.key === "signature")).toBe(false);
    expect(print.tables[0].columns.at(-1)?.key).toBe("signature");
    expect(screen.title).toBe("Wage Sheet — July 2026");
  });
});

describe("sub offices & posting wages to cost centers", () => {
  const POST_MONTH = "2026-05";

  it("a sub office is a cost center listed after Head Office; Head Office can't become one", async () => {
    const opts = await listProjectOptions(acc);
    const ho = opts.findIndex((p) => p.isHeadOffice);
    const so = opts.findIndex((p) => p.id === subOffice);
    expect(opts[so].isSubOffice).toBe(true);
    expect(ho).toBeLessThan(so);
    expect(opts.findIndex((p) => p.id === siteProject)).toBeGreaterThan(so);

    const hoRow = await db.project.findFirstOrThrow({ where: { isHeadOffice: true } });
    await updateProject(await admin(), hoRow.id, {
      code: hoRow.code, name: hoRow.name, clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget: null, notes: null, isSubOffice: true, siteInchargeIds: [],
    });
    expect((await db.project.findUniqueOrThrow({ where: { id: hoRow.id } })).isSubOffice).toBe(false);
  });

  it("wage sheet shows each employee's cost center, filters by it and totals per cost center", async () => {
    const w = await worker({ rateType: "MONTHLY", rate: "31000", projectId: subOffice });
    const r = await rowOf(w.id, POST_MONTH);
    expect(r.costCenter).toMatchObject({ id: subOffice, isSubOffice: true });

    const filtered = await payroll.getWageSheet(acc, POST_MONTH, { costCenterId: subOffice });
    expect(filtered.rows.length).toBeGreaterThan(0);
    expect(filtered.rows.every((x) => x.costCenter?.id === subOffice)).toBe(true);

    const report = await payroll.wageSheetReport(acc, POST_MONTH, { costCenterId: subOffice });
    const byCenter = report.tables[1];
    expect(byCenter.title).toBe("By cost center");
    expect(byCenter.rows[0].cells).toMatchObject({ kind: "Sub office" });
  });

  it("posts each balance due as a salary / wage payment charged to the cost center", async () => {
    const staff = await worker({ rateType: "MONTHLY", rate: "31000", projectId: subOffice });
    const daily = await worker({ rate: "1500", projectId: siteProject });
    await payroll.saveAttendance(acc, mark(`${POST_MONTH}-04`, [[staff.id, "ABSENT"], [daily.id, "PRESENT"]]));
    await payroll.saveAttendance(acc, mark(`${POST_MONTH}-05`, [[daily.id, "HALF_DAY"]]));
    await payroll.createPayAdjustment(acc, adj(staff.id, { date: `${POST_MONTH}-20`, type: "REWARD", amount: "2000" }));

    const ids = await payroll.postWages(acc, {
      month: POST_MONTH, date: "2026-05-31", paymentMode: "BANK_TRANSFER", workerIds: [staff.id, daily.id, staff.id],
    });
    expect(ids).toHaveLength(2); // duplicates ignored
    const rows = await db.expense.findMany({ where: { id: { in: ids } }, include: { subhead: true }, orderBy: { id: "asc" } });
    expect(rows[0]).toMatchObject({ projectId: subOffice, workerId: staff.id, status: "APPROVED", referenceNo: "WAGES-2026-05" });
    expect(rows[0].subhead.name).toBe("Salaries");
    expect(rows[0].amount.toFixed(2)).toBe("32000.00"); // 31000 - 1000 absent + 2000 reward
    expect(rows[1]).toMatchObject({ projectId: siteProject, workerId: daily.id });
    expect(rows[1].subhead.name).toBe("Daily wages");
    expect(rows[1].amount.toFixed(2)).toBe("2250.00");
    expect(rows[1].description).toContain("1.5 days");

    // Paid now: nothing left, and posting again is refused
    expect((await rowOf(staff.id, POST_MONTH)).due.toFixed(2)).toBe("0.00");
    await expect(
      payroll.postWages(acc, { month: POST_MONTH, date: "2026-05-31", paymentMode: "CASH", workerIds: [staff.id] }),
    ).rejects.toThrow(/nothing due/);
  });

  it("refuses the whole batch when anyone can't be paid", async () => {
    const ok = await worker({ rateType: "MONTHLY", rate: "10000", projectId: subOffice });
    const unallocated = await worker({ rateType: "MONTHLY", rate: "10000" });
    const pending = await worker({ rateType: "MONTHLY", rate: "10000", projectId: siteProject });
    await pay(site, pending.id, "100", { date: `${POST_MONTH}-10` }); // site in-charge entry stays pending

    const before = await db.expense.count();
    await expect(
      payroll.postWages(acc, { month: POST_MONTH, date: "2026-05-31", paymentMode: "CASH", workerIds: [ok.id, unallocated.id] }),
    ).rejects.toThrow(/no cost center/);
    await expect(
      payroll.postWages(acc, { month: POST_MONTH, date: "2026-05-31", paymentMode: "CASH", workerIds: [ok.id, pending.id] }),
    ).rejects.toThrow(/pending labour payment/);
    expect(await db.expense.count()).toBe(before);

    const postable = await payroll.getPostableWages(acc, POST_MONTH);
    expect(postable.find((p) => p.row.worker.id === ok.id)?.problem).toBeNull();
    expect(postable.find((p) => p.row.worker.id === unallocated.id)?.problem).toMatch(/no cost center/);

    await expect(
      payroll.postWages(site, { month: POST_MONTH, date: "2026-05-31", paymentMode: "CASH", workerIds: [ok.id] }),
    ).rejects.toThrow(ForbiddenError);
  });

  it("bulk posting doesn't take cheques (each needs its own number)", () => {
    const base = { month: "2026-05", date: "2026-05-31", workerIds: ["1", "2"] };
    expect(postWagesSchema.safeParse({ ...base, paymentMode: "CHEQUE" }).success).toBe(false);
    expect(postWagesSchema.safeParse({ ...base, paymentMode: "CASH" }).data?.workerIds).toEqual([1, 2]);
    expect(postWagesSchema.safeParse({ ...base, paymentMode: "CASH", workerIds: undefined }).success).toBe(false);
  });
});
