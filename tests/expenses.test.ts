import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { AppError, ForbiddenError } from "@/lib/errors";
import { formatAmount, formatDate, formatPKR } from "@/lib/format";
import { formDataToObject } from "@/lib/forms";
import { multiplyMoney, sumMoney, toPaisa } from "@/lib/money";
import { expenseSchema, splitExpenseSchema, type ExpenseInput } from "@/lib/validation/expenses";
import * as exp from "@/server/services/expense-service";
import * as projects from "@/server/services/project-service";
import { updateCompanySettings } from "@/server/services/settings-service";
import { setHeadActive, setSubheadActive } from "@/server/services/head-service";
import { spentByProject } from "@/server/services/totals";
import { admin, makeUser } from "./helpers";

type Actor = Awaited<ReturnType<typeof makeUser>>;
let adminA: Actor, acc: Actor, site: Actor, site2: Actor;
let projA: number, projB: number, projDone: number;
let materials: { id: number; cement: number; steel: number };
let labour: { id: number; wages: number; advance: number };
let otherHeadSub: number; // a sub-head of a different head

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], "receipt.png", { type: "image/png" });

let n = 0;
async function project(status: "ACTIVE" | "COMPLETED" = "ACTIVE", siteIds: number[] = []) {
  n += 1;
  const p = await projects.createProject(adminA, {
    code: `EX-${Date.now()}-${n}`,
    name: `Expense test ${n}`,
    clientName: null, projectManager: null,
    location: null,
    startDate: "2026-01-01",
    endDate: null,
    status,
    budget: null,
    notes: null,
    isSubOffice: false, siteInchargeIds: siteIds,
  });
  return p!.id;
}

function input(extra: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    date: "2026-10-01",
    projectId: projA,
    headId: materials.id,
    subheadId: materials.cement,
    amount: "1000",
    paymentMode: "CASH",
    chequeNo: null,
    paidTo: "Shop",
    vendorId: null,
    workerId: null,
    paidFromId: null,
    referenceNo: null,
    description: "Test",
    gstAmount: null,
    whtAmount: null,
    ...extra,
  };
}

beforeAll(async () => {
  adminA = { ...(await admin()), username: "admin" };
  acc = await makeUser("ACCOUNTANT");
  site = await makeUser("SITE_INCHARGE");
  site2 = await makeUser("SITE_INCHARGE");
  projA = await project("ACTIVE", [site.id]);
  projB = await project("ACTIVE", [site2.id]);
  projDone = await project("COMPLETED", [site.id]);
  const m = await db.expenseHead.findUniqueOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
  materials = {
    id: m.id,
    cement: m.subheads.find((s) => s.name === "Cement")!.id,
    steel: m.subheads.find((s) => s.name === "Steel")!.id,
  };
  const l = await db.expenseHead.findUniqueOrThrow({ where: { name: LABOUR_HEAD }, include: { subheads: true } });
  labour = {
    id: l.id,
    wages: l.subheads.find((s) => s.name === "Daily wages")!.id,
    advance: l.subheads.find((s) => s.name === ADVANCE_SUBHEAD)!.id,
  };
  otherHeadSub = l.subheads[0].id;
  // Default: auto-approve ON
  await updateCompanySettings(adminA, {
    companyName: "Test",
    companyAddress: null,
    currencyLabel: "PKR",
    autoApprovePrivileged: true,
    removeLogo: false,
  });
});

const create = (actor: Actor, data: ExpenseInput, files: File[] = []) =>
  exp.createExpenses(actor, { kind: "single", data }, files).then((ids) => ids[0]);
const get = (id: number) => db.expense.findUniqueOrThrow({ where: { id }, include: { attachments: true } });

// ---------------------------------------------------------------------------
describe("money & formatting (rule 9)", () => {
  it("does exact decimal maths and formats PKR / DD-MM-YYYY", () => {
    expect(sumMoney(["0.10", "0.20"])).toBe("0.30"); // would be 0.30000000000000004 with floats
    expect(multiplyMoney("1500", "6")).toBe("9000.00");
    expect(multiplyMoney("1333.33", "1.5")).toBe("2000.00"); // 1999.995 rounds half-up
    expect(toPaisa("1,250,000.5")).toBe(125000050n);
    expect(formatPKR("1250000")).toBe("PKR 1,250,000");
    expect(formatAmount("1250.50")).toBe("1,250.50");
    expect(formatDate(new Date("2026-03-07T00:00:00Z"))).toBe("07-03-2026");
  });

  it("stores amounts as exact decimals", async () => {
    const id = await create(acc, input({ amount: "1234567.89" }));
    expect((await get(id)).amount.toFixed(2)).toBe("1234567.89");
  });
});

describe("rule 1 — required fields and cheque number", () => {
  const form = (extra: Record<string, string> = {}) => ({
    date: "2026-10-01", projectId: "1", headId: "1", subheadId: "1", amount: "100",
    paymentMode: "CASH", paidTo: "X", description: "Y", ...extra,
  });
  it("rejects missing fields, zero amounts and cheque without number", () => {
    expect(expenseSchema.safeParse(form()).success).toBe(true);
    for (const missing of ["date", "projectId", "headId", "subheadId", "amount", "paidTo", "description"]) {
      const r = expenseSchema.safeParse({ ...form(), [missing]: "" });
      expect(r.success, `missing ${missing}`).toBe(false);
    }
    expect(expenseSchema.safeParse(form({ amount: "0" })).success).toBe(false);
    expect(expenseSchema.safeParse(form({ amount: "-5" })).success).toBe(false);
    expect(expenseSchema.safeParse(form({ amount: "10.123" })).success).toBe(false);
    expect(expenseSchema.safeParse(form({ paymentMode: "CHEQUE" })).success).toBe(false);
    expect(expenseSchema.safeParse(form({ paymentMode: "CHEQUE", chequeNo: "123456" })).success).toBe(true);
  });

  it("drops a cheque number that doesn't belong to a cheque payment", async () => {
    const id = await create(acc, input({ paymentMode: "CASH", chequeNo: "999" }));
    expect((await get(id)).chequeNo).toBeNull();
  });
});

describe("rule 2 — head / sub-head", () => {
  it("rejects a sub-head from a different head", async () => {
    await expect(create(acc, input({ subheadId: otherHeadSub }))).rejects.toThrow("does not belong");
  });

  it("disabled heads/sub-heads cannot be used for new expenses but stay on old ones", async () => {
    const old = await create(acc, input({ subheadId: materials.steel }));
    await setSubheadActive(adminA, materials.steel, false);
    try {
      await expect(create(acc, input({ subheadId: materials.steel }))).rejects.toThrow("disabled");
      // Editing the old record without changing head/sub-head is still allowed (admin: approved)
      await exp.updateExpense(adminA, old, input({ subheadId: materials.steel, amount: "1500" }));
      expect((await get(old)).amount.toFixed(0)).toBe("1500");
      // …but switching an existing record TO a disabled sub-head is not
      const other = await create(acc, input());
      await expect(exp.updateExpense(adminA, other, input({ subheadId: materials.steel }))).rejects.toThrow("disabled");
    } finally {
      await setSubheadActive(adminA, materials.steel, true);
    }
    await setHeadActive(adminA, materials.id, false);
    try {
      await expect(create(acc, input())).rejects.toThrow("disabled");
    } finally {
      await setHeadActive(adminA, materials.id, true);
    }
  });
});

describe("rule 3 — completed projects", () => {
  it("blocks new expenses on COMPLETED projects", async () => {
    await expect(create(acc, input({ projectId: projDone }))).rejects.toThrow("Completed");
    await expect(create(site, input({ projectId: projDone }))).rejects.toThrow("Completed");
  });
});

describe("rule 4 — site in-charge access", () => {
  it("can only create for and see assigned projects, and cannot approve", async () => {
    await expect(create(site, input({ projectId: projB }))).rejects.toBeInstanceOf(ForbiddenError);
    const mine = await create(site, input({ projectId: projA }));
    const theirs = await create(site2, input({ projectId: projB }));

    const list = await exp.listExpenses(site, {});
    expect(list.rows.every((r) => r.projectId === projA || r.projectId === projDone)).toBe(true);
    expect(list.rows.some((r) => r.id === theirs)).toBe(false);
    await expect(exp.getExpenseDetail(site, theirs)).rejects.toBeInstanceOf(ForbiddenError);

    await expect(exp.approveExpense(site, mine)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exp.rejectExpense(site, mine, "no")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exp.listPendingApprovals(site)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("site in-charges' receipts are private to people who can see the expense", async () => {
    const id = await create(site2, input({ projectId: projB }), [png()]);
    const att = (await get(id)).attachments[0];
    await expect(exp.getAttachment(site, att.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exp.getAttachment(acc, att.id)).resolves.toBeTruthy();
  });
});

describe("rule 5 — status flow", () => {
  it("site entries start PENDING; privileged entries auto-approve when the setting is ON", async () => {
    const s = await get(await create(site, input()));
    expect(s.status).toBe("PENDING");
    const a = await get(await create(acc, input()));
    expect(a.status).toBe("APPROVED");
    expect(a.approvedById).toBe(acc.id);

    await updateCompanySettings(adminA, { companyName: "Test", companyAddress: null, currencyLabel: "PKR", autoApprovePrivileged: false, removeLogo: false });
    try {
      expect((await get(await create(acc, input()))).status).toBe("PENDING");
    } finally {
      await updateCompanySettings(adminA, { companyName: "Test", companyAddress: null, currencyLabel: "PKR", autoApprovePrivileged: true, removeLogo: false });
    }
  });

  it("PENDING -> APPROVED locks the entry; only ADMIN can edit it, and the change is logged", async () => {
    const id = await create(site, input());
    await exp.approveExpense(acc, id);
    const approved = await get(id);
    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedById).toBe(acc.id);

    await expect(exp.updateExpense(site, id, input({ amount: "5" }))).rejects.toThrow("locked");
    await expect(exp.updateExpense(acc, id, input({ amount: "5" }))).rejects.toThrow("locked");
    await expect(exp.deleteExpense(site, id)).rejects.toThrow("locked");

    await exp.updateExpense(adminA, id, input({ amount: "1200" }));
    const after = await get(id);
    expect(after.amount.toFixed(0)).toBe("1200");
    expect(after.status).toBe("APPROVED");
    const log = await db.activityLog.findFirst({ where: { entityType: "expense", entityId: id, action: "UPDATE" } });
    expect(log?.userId).toBe(adminA.id);
    expect(log?.changes).toMatchObject({ amount: { old: "1000", new: "1200" }, editedWhileApproved: true });

    // cannot approve twice
    await expect(exp.approveExpense(acc, id)).rejects.toThrow("Only pending");
  });

  it("REJECTED needs a reason; the creator can edit and resubmit (back to PENDING)", async () => {
    const id = await create(site, input());
    await expect(exp.rejectExpense(acc, id, "  ")).rejects.toBeInstanceOf(AppError);
    await exp.rejectExpense(acc, id, "Receipt unreadable");
    const rejected = await get(id);
    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe("Receipt unreadable");

    const other = await makeUser("SITE_INCHARGE");
    await db.projectUser.create({ data: { projectId: projA, userId: other.id } });
    await expect(exp.updateExpense(other, id, input())).rejects.toBeInstanceOf(ForbiddenError);

    await exp.updateExpense(site, id, input({ description: "Clear photo attached" }), { newFiles: [png()] });
    const resubmitted = await get(id);
    expect(resubmitted.status).toBe("PENDING");
    expect(resubmitted.rejectionReason).toBeNull();
    expect(resubmitted.attachments).toHaveLength(1);
  });

  it("every create / approve / reject / delete is logged", async () => {
    const id = await create(site, input());
    await exp.approveExpense(acc, id);
    await exp.deleteExpense(adminA, id);
    const actions = (await db.activityLog.findMany({ where: { entityType: "expense", entityId: id } })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(["CREATE", "APPROVE", "DELETE"]));
  });
});

describe("rules 6 & 8 — totals and soft delete", () => {
  it("only APPROVED, non-deleted expenses count in totals", async () => {
    const p = await project("ACTIVE", [site.id]);
    await create(acc, input({ projectId: p, amount: "100" })); // approved (auto)
    const pending = await create(site, input({ projectId: p, amount: "20" }));
    const rejected = await create(site, input({ projectId: p, amount: "30" }));
    await exp.rejectExpense(acc, rejected, "no");
    const deleted = await create(acc, input({ projectId: p, amount: "40" }));
    await exp.deleteExpense(adminA, deleted);

    expect((await spentByProject([p])).get(p)?.toFixed(2)).toBe("100.00");
    const list = await exp.listExpenses(acc, { projectId: p });
    expect(list.count).toBe(3); // deleted one is gone from the list
    expect(list.total.toFixed(2)).toBe("150.00");
    expect(list.approvedTotal.toFixed(2)).toBe("100.00");
    expect((await db.expense.findUnique({ where: { id: deleted } }))?.deletedAt).not.toBeNull(); // soft
    await expect(exp.getExpenseDetail(acc, deleted)).rejects.toThrow("not found");
    expect(pending).toBeGreaterThan(0);
  });
});

describe("rule 7 — split bills", () => {
  it("schema requires lines to add up exactly to the bill total", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      date: "2026-10-02", paymentMode: "CASH", paidTo: "PSO", description: "Fuel", billTotal: "30,000",
      "lines.0.projectId": "1", "lines.0.headId": "1", "lines.0.subheadId": "1", "lines.0.amount": "18000",
      "lines.1.projectId": "2", "lines.1.headId": "1", "lines.1.subheadId": "1", "lines.1.amount": "11999.99",
    })) fd.append(k, v);
    const bad = splitExpenseSchema.safeParse(formDataToObject(fd));
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].path).toEqual(["billTotal"]);
    fd.set("lines.1.amount", "12000");
    expect(splitExpenseSchema.safeParse(formDataToObject(fd)).success).toBe(true);
  });

  it("saves separate rows sharing a split_group_id with the receipt on every line; approval covers the bill", async () => {
    const ids = await exp.createExpenses(
      site,
      {
        kind: "split",
        data: {
          ...input(),
          billTotal: "30000",
          lines: [
            { projectId: projA, headId: materials.id, subheadId: materials.cement, amount: "18000" },
            { projectId: projA, headId: materials.id, subheadId: materials.steel, amount: "12000" },
          ],
        },
      },
      [png()],
    );
    expect(ids).toHaveLength(2);
    const rows = await Promise.all(ids.map(get));
    expect(rows[0].splitGroupId).toBeTruthy();
    expect(rows[0].splitGroupId).toBe(rows[1].splitGroupId);
    expect(rows.map((r) => r.amount.toFixed(0))).toEqual(["18000", "12000"]);
    expect(rows[0].attachments[0].filePath).toBe(rows[1].attachments[0].filePath); // same file, two rows
    expect(new Set(rows.map((r) => r.expenseNo)).size).toBe(2);

    expect(await exp.approveExpense(acc, ids[1])).toBe(2);
    expect((await Promise.all(ids.map(get))).every((r) => r.status === "APPROVED")).toBe(true);
  });

  it("each split line is checked for project access", async () => {
    await expect(
      exp.createExpenses(site, {
        kind: "split",
        data: {
          ...input(),
          billTotal: "300",
          lines: [
            { projectId: projA, headId: materials.id, subheadId: materials.cement, amount: "100" },
            { projectId: projB, headId: materials.id, subheadId: materials.cement, amount: "200" },
          ],
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("labour payments & expense numbers", () => {
  it("labour payments must use the Labour head and a worker", async () => {
    const w = await db.worker.create({ data: { name: "W", trade: "MASON", rateType: "DAILY", rate: "1500" } });
    const id = (
      await exp.createExpenses(acc, {
        kind: "labour",
        data: { ...input({ headId: labour.id, subheadId: labour.wages, amount: multiplyMoney("1500", "6") }), workerId: w.id },
      })
    )[0];
    expect((await get(id)).amount.toFixed(0)).toBe("9000");
    await expect(
      exp.createExpenses(acc, { kind: "labour", data: { ...input(), workerId: w.id } }),
    ).rejects.toThrow("Labour");
  });

  it("numbers are unique and sequential: EXP-YYYY-00001", async () => {
    const a = await get(await create(acc, input()));
    const b = await get(await create(acc, input()));
    expect(a.expenseNo).toMatch(/^EXP-\d{4}-\d{5}$/);
    expect(Number(b.expenseNo.slice(-5))).toBe(Number(a.expenseNo.slice(-5)) + 1);
  });

  it("rejects bad receipt files and too many attachments", async () => {
    const txt = new File(["hello"], "receipt.jpg", { type: "image/jpeg" });
    await expect(create(acc, input(), [txt])).rejects.toThrow("not an allowed file type");
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    await expect(create(acc, input(), [big])).rejects.toThrow("larger than 5 MB");
    await expect(create(acc, input(), Array.from({ length: 11 }, png))).rejects.toThrow("at most 10");
  });
});
