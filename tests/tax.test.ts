import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { formDataToObject } from "@/lib/forms";
import { apportionMoney, sumMoney } from "@/lib/money";
import { expenseSchema, splitExpenseSchema, type ExpenseInput } from "@/lib/validation/expenses";
import * as cash from "@/server/services/cash-service";
import * as exp from "@/server/services/expense-service";
import { createProject } from "@/server/services/project-service";
import { buildReport } from "@/server/services/report-service";
import { admin, makeUser } from "./helpers";

// GST and withholding tax on expenses (changes/changes.pdf §4).

type Actor = Awaited<ReturnType<typeof makeUser>>;
let acc: Actor;
let p1: number, p2: number;
let materials: { id: number; sub: number };
let vendorId: number;

const input = (extra: Partial<ExpenseInput> = {}): ExpenseInput => ({
  date: "2026-06-10",
  projectId: p1,
  headId: materials.id,
  subheadId: materials.sub,
  amount: "11800",
  paymentMode: "BANK_TRANSFER",
  chequeNo: null,
  paidTo: "Steel supplier",
  vendorId: null,
  workerId: null,
  paidFromId: null,
  referenceNo: "INV-77",
  description: "Steel bars",
  gstAmount: null,
  whtAmount: null,
  ...extra,
});

const get = (id: number) => db.expense.findUniqueOrThrow({ where: { id } });

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return formDataToObject(fd);
}

beforeAll(async () => {
  const a = await admin();
  acc = await makeUser("ACCOUNTANT"); // auto-approve is on in the seed
  const mk = async (name: string) =>
    (await createProject(a, {
      code: `TX-${Date.now()}-${name}`, name, clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget: null, notes: null, isSubOffice: false, siteInchargeIds: [],
    }))!.id;
  p1 = await mk("Tax One");
  p2 = await mk("Tax Two");
  const m = await db.expenseHead.findUniqueOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
  materials = { id: m.id, sub: m.subheads[0].id };
  vendorId = (await db.vendor.create({ data: { name: `Tax Vendor ${Date.now()}`, type: "SUPPLIER", ntn: "1234567-8" } })).id;
});

describe("apportionMoney", () => {
  it("shares a total in proportion and always adds up exactly", () => {
    expect(apportionMoney("100", ["1", "2"])).toEqual(["33.33", "66.67"]);
    expect(apportionMoney("4500", ["18000", "12000"])).toEqual(["2700.00", "1800.00"]);
    const shares = apportionMoney("10.01", ["1", "1", "1"]);
    expect(sumMoney(shares)).toBe("10.01");
  });
});

describe("validation", () => {
  const base = { date: "2026-06-10", projectId: "1", headId: "1", subheadId: "1", paymentMode: "CASH", paidTo: "X", description: "d" };

  it("taxes are optional and accept commas", () => {
    const r = expenseSchema.safeParse(form({ ...base, amount: "11,800", gstAmount: "1,800", whtAmount: "" }));
    expect(r.success).toBe(true);
    expect(r.data?.gstAmount).toBe("1800");
    expect(r.data?.whtAmount).toBeNull();
  });

  it("a tax cannot be more than the amount", () => {
    const r = expenseSchema.safeParse(form({ ...base, amount: "1000", whtAmount: "1000.01" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["whtAmount"]);
    expect(expenseSchema.safeParse(form({ ...base, amount: "1000", gstAmount: "abc" })).success).toBe(false);
  });

  it("split bill taxes are checked against the bill total", () => {
    const split = {
      ...base, billTotal: "30000", gstAmount: "30000.01",
      "lines.0.projectId": "1", "lines.0.headId": "1", "lines.0.subheadId": "1", "lines.0.amount": "18000",
      "lines.1.projectId": "2", "lines.1.headId": "1", "lines.1.subheadId": "1", "lines.1.amount": "12000",
    };
    const r = splitExpenseSchema.safeParse(form(split));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["gstAmount"]);
    expect(splitExpenseSchema.safeParse(form({ ...split, gstAmount: "4500" })).success).toBe(true);
  });
});

describe("saving", () => {
  it("stores GST and withholding tax; zero means none", async () => {
    const [id] = await exp.createExpenses(acc, { kind: "single", data: input({ gstAmount: "1800", whtAmount: "531" }) });
    const e = await get(id);
    expect(e.amount.toFixed(2)).toBe("11800.00");
    expect(e.gstAmount?.toFixed(2)).toBe("1800.00");
    expect(e.whtAmount?.toFixed(2)).toBe("531.00");

    await exp.updateExpense(await admin(), id, input({ gstAmount: "0", whtAmount: null }));
    const after = await get(id);
    expect(after.gstAmount).toBeNull();
    expect(after.whtAmount).toBeNull();
  });

  it("shares a split bill's taxes across its lines, adding up exactly", async () => {
    const ids = await exp.createExpenses(acc, {
      kind: "split",
      data: {
        ...input({ gstAmount: "100", whtAmount: "10.01" }),
        billTotal: "300",
        lines: [
          { projectId: p1, headId: materials.id, subheadId: materials.sub, amount: "100" },
          { projectId: p2, headId: materials.id, subheadId: materials.sub, amount: "200" },
        ],
      },
    });
    const rows = await Promise.all(ids.map(get));
    expect(rows.map((r) => r.gstAmount?.toFixed(2))).toEqual(["33.33", "66.67"]);
    expect(rows.map((r) => r.whtAmount?.toFixed(2))).toEqual(["3.33", "6.68"]);
  });
});

describe("cash in hand", () => {
  it("an employee's balance goes down by the net paid (withholding tax is kept back)", async () => {
    const w = await db.worker.create({
      data: { name: `Tax cash ${Date.now()}`, trade: "OTHER", rateType: "MONTHLY", rate: "1", employeeType: "PERMANENT" },
    });
    await cash.createCashEntry(acc, {
      date: "2026-06-01", workerId: w.id, type: "ISSUED", amount: "20000", paymentMode: "CASH",
      projectId: null, referenceNo: null, notes: null,
    });
    await exp.createExpenses(acc, { kind: "single", data: input({ paidFromId: w.id, amount: "10000", whtAmount: "450" }) });
    const b = (await cash.cashBalances([w.id])).get(w.id)!;
    expect(b.spent.toFixed(2)).toBe("9550.00");
    expect(b.balance.toFixed(2)).toBe("10450.00");

    const statement = await cash.getCashStatement(acc, w.id);
    expect(statement.rows.at(-1)?.moneyOut?.toFixed(2)).toBe("9550.00");
  });
});

describe("reports", () => {
  it("tax report lists only taxed entries with per-payee totals", async () => {
    await exp.createExpenses(acc, { kind: "single", data: input({ vendorId, gstAmount: "1800", whtAmount: "590" }) });
    await exp.createExpenses(acc, { kind: "single", data: input({ vendorId, amount: "5000", gstAmount: "762.71" }) });
    await exp.createExpenses(acc, { kind: "single", data: input({ vendorId, amount: "999" }) }); // no tax: left out

    const r = await buildReport(acc, "tax", { period: "all", includePending: false, vendorId });
    const [summary, entries] = r.tables;
    expect(entries.rows).toHaveLength(2);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].cells).toMatchObject({ ntn: "1234567-8", entries: 2, amount: "16800.00", gst: "2562.71", wht: "590.00", net: "16210.00" });
    expect(entries.totals).toMatchObject({ gst: "2562.71", wht: "590.00" });
  });

  it("vendor report shows GST, WHT and net paid", async () => {
    const r = await buildReport(acc, "vendors", { period: "all", includePending: false, vendorId });
    expect(r.tables[0].rows[0].cells).toMatchObject({ total: "17799.00", gst: "2562.71", wht: "590.00", net: "17209.00" });
    expect(r.tables[1].totals).toMatchObject({ gst: "2562.71", wht: "590.00" });
  });
});
