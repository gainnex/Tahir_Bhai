import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { amountInWords } from "@/lib/amount-words";
import { ForbiddenError } from "@/lib/errors";
import { formDataToObject } from "@/lib/forms";
import type { ExpenseInput } from "@/lib/validation/expenses";
import { clientReceiptSchema, type ClientBillInput, type ClientReceiptInput } from "@/lib/validation/billing";
import { billToPdf, receiptToPdf } from "@/server/reports/billing-pdf";
import * as billing from "@/server/services/billing-service";
import { createExpenses } from "@/server/services/expense-service";
import { createProject } from "@/server/services/project-service";
import { buildReport } from "@/server/services/report-service";
import { getSettings } from "@/server/services/settings-service";
import { admin, makeUser } from "./helpers";

// Client bills, verification, receipts and project profitability (changes/changes.pdf §6, §7).

type Actor = Awaited<ReturnType<typeof makeUser>>;
let acc: Actor, site: Actor;
let projectId: number, otherProject: number;
let materials: { id: number; sub: number };

const bill = (extra: Partial<ClientBillInput> = {}): ClientBillInput => ({
  projectId,
  date: "2026-06-01",
  clientRef: "RA Bill No. 1",
  description: "Work done up to 31-05-2026",
  claimedAmount: "1000000",
  ...extra,
});

const receipt = (extra: Partial<ClientReceiptInput> = {}): ClientReceiptInput => ({
  date: "2026-06-20",
  amount: "500000",
  taxDeducted: null,
  paymentMode: "BANK_TRANSFER",
  referenceNo: "TRX-1",
  notes: null,
  ...extra,
});

const verify = (id: number, approvedAmount = "900000", verifiedDate = "2026-06-10") =>
  billing.verifyBill(acc, id, { approvedAmount, verifiedDate, verificationNote: null });

beforeAll(async () => {
  const a = await admin();
  acc = await makeUser("ACCOUNTANT"); // auto-approve is on in the seed
  site = await makeUser("SITE_INCHARGE");
  const mk = async (name: string, budget: string | null) =>
    (await createProject(a, {
      code: `BL-${Date.now()}-${name}`, name, clientName: "Acme Developers", projectManager: null, location: "Lahore",
      startDate: "2026-01-01", endDate: null, status: "ACTIVE", budget, notes: null, isSubOffice: false, siteInchargeIds: [],
    }))!.id;
  projectId = await mk("Tower", "5000000");
  otherProject = await mk("Villas", null);
  const m = await db.expenseHead.findUniqueOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
  materials = { id: m.id, sub: m.subheads[0].id };
});

describe("amount in words", () => {
  it("uses lakh / crore and paisa", () => {
    expect(amountInWords("100")).toBe("Rupees One Hundred Only");
    expect(amountInWords("125000.50")).toBe("Rupees One Lakh Twenty-Five Thousand and Fifty Paisa Only");
    expect(amountInWords("12345678")).toBe("Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only");
    expect(amountInWords("1500000000")).toBe("Rupees One Hundred Fifty Crore Only");
    expect(amountInWords("0.05")).toBe("Rupees Zero and Five Paisa Only");
  });
});

describe("bills", () => {
  it("are numbered, Admin / Accountant only, and only for client projects", async () => {
    const b = await billing.createBill(acc, bill());
    expect(b.billNo).toMatch(/^BIL-\d{4}-\d{5}$/);
    expect(b.status).toBe("CLAIMED");
    await expect(billing.createBill(site, bill())).rejects.toThrow(ForbiddenError);
    const ho = await db.project.findFirstOrThrow({ where: { isHeadOffice: true } });
    await expect(billing.createBill(acc, bill({ projectId: ho.id }))).rejects.toThrow(/client projects/);
  });

  it("verification: approved ≤ claimed, not before the bill date; can be undone before any receipt", async () => {
    const b = await billing.createBill(acc, bill());
    await expect(verify(b.id, "1000000.01")).rejects.toThrow(/more than the claimed/);
    await expect(verify(b.id, "900000", "2026-05-31")).rejects.toThrow(/before the bill date/);
    await verify(b.id);
    const { bill: v, totals } = await billing.getBill(acc, b.id);
    expect(v.status).toBe("VERIFIED");
    expect(totals).toMatchObject({ state: "UNPAID" });
    expect(totals.outstanding?.toFixed(2)).toBe("900000.00");
    await billing.unverifyBill(acc, b.id);
    expect((await billing.getBill(acc, b.id)).bill).toMatchObject({ status: "CLAIMED", approvedAmount: null });
    const log = await db.activityLog.findMany({ where: { entityType: "client_bill", entityId: b.id } });
    expect(log.map((l) => l.action)).toEqual(["CREATE", "APPROVE", "UPDATE"]);
  });
});

describe("receipts", () => {
  it("only on verified bills; received + tax deducted can't exceed the approved amount", async () => {
    const b = await billing.createBill(acc, bill());
    await expect(billing.createReceipt(acc, b.id, receipt())).rejects.toThrow(/verified amount/);
    await verify(b.id);
    await expect(billing.createReceipt(acc, b.id, receipt({ date: "2026-05-30" }))).rejects.toThrow(/before the bill date/);

    const r1 = await billing.createReceipt(acc, b.id, receipt({ amount: "450000", taxDeducted: "50000" }));
    expect(r1.receiptNo).toMatch(/^RCT-\d{4}-\d{5}$/);
    let t = (await billing.getBill(acc, b.id)).totals;
    expect(t.state).toBe("PART_PAID");
    expect(t.credited.toFixed(2)).toBe("500000.00");
    expect(t.outstanding?.toFixed(2)).toBe("400000.00");

    await expect(billing.createReceipt(acc, b.id, receipt({ amount: "400000.01" }))).rejects.toThrow(/Only 400000.00 is outstanding/);
    const r2 = await billing.createReceipt(acc, b.id, receipt({ amount: "400000", date: "2026-07-01" }));
    t = (await billing.getBill(acc, b.id)).totals;
    expect(t.state).toBe("PAID");
    expect(t.outstanding?.toFixed(2)).toBe("0.00");

    // Editing a receipt is checked against the others; the approved amount can't drop below what's credited
    await expect(billing.updateReceipt(acc, r2.id, receipt({ amount: "400001", date: "2026-07-01" }))).rejects.toThrow(/outstanding/);
    await expect(verify(b.id, "899999")).rejects.toThrow(/cannot be lower/);
    await expect(billing.updateBill(acc, b.id, bill({ claimedAmount: "800000" }))).rejects.toThrow(/less than the approved/);
    await expect(billing.updateBill(acc, b.id, bill({ projectId: otherProject }))).rejects.toThrow(/cannot be moved/);
    // …and a bill with receipts can't be deleted or un-verified
    await expect(billing.deleteBill(acc, b.id)).rejects.toThrow(/has receipts/);
    await expect(billing.unverifyBill(acc, b.id)).rejects.toThrow(/has receipts/);

    expect(await billing.deleteReceipt(acc, r2.id)).toBe(b.id);
    expect((await billing.getBill(acc, b.id)).totals.state).toBe("PART_PAID");
  });

  it("cheque receipts need the cheque number", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ date: "2026-06-20", amount: "100", paymentMode: "CHEQUE", referenceNo: "" })) fd.append(k, v);
    const r = clientReceiptSchema.safeParse(formDataToObject(fd));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["referenceNo"]);
  });

  it("printable receipt shows the bill position as at that receipt; PDFs render", async () => {
    const b = await billing.createBill(acc, bill({ claimedAmount: "300000" }));
    await verify(b.id, "300000");
    const first = await billing.createReceipt(acc, b.id, receipt({ amount: "100000" }));
    await billing.createReceipt(acc, b.id, receipt({ amount: "50000", date: "2026-06-25" }));
    const doc = await billing.receiptDocument(acc, first.id);
    expect(doc).toMatchObject({ client: "Acme Developers", amount: "100000.00", creditedToDate: "100000.00", outstanding: "200000.00" });

    const settings = await getSettings();
    const pdf = await receiptToPdf(doc, settings);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const billDoc = await billing.billDocument(acc, b.id);
    expect(Number(billDoc.previousClaims)).toBeGreaterThan(0); // earlier bills on this project
    expect((await billToPdf(billDoc, settings)).subarray(0, 4).toString()).toBe("%PDF");
    await expect(billing.receiptDocument(site, first.id)).rejects.toThrow(ForbiddenError);
  });
});

describe("profitability & receivables", () => {
  it("verified billing − cost = margin per project; overheads shown separately", async () => {
    const p = await createProject(await admin(), {
      code: `BL-${Date.now()}-P`, name: "Profit test", clientName: "Beta", projectManager: null, location: null,
      startDate: "2026-01-01", endDate: null, status: "ACTIVE", budget: "2000000", notes: null, isSubOffice: false, siteInchargeIds: [],
    });
    const b = await billing.createBill(acc, bill({ projectId: p!.id, claimedAmount: "800000" }));
    await verify(b.id, "750000");
    await billing.createReceipt(acc, b.id, receipt({ amount: "600000" }));
    await billing.createBill(acc, bill({ projectId: p!.id, claimedAmount: "100000", date: "2026-07-01" })); // not verified yet
    const expense: ExpenseInput = {
      date: "2026-06-05", projectId: p!.id, headId: materials.id, subheadId: materials.sub, amount: "500000",
      paymentMode: "CASH", chequeNo: null, paidTo: "Supplier", vendorId: null, workerId: null, paidFromId: null,
      referenceNo: null, description: "Steel", gstAmount: null, whtAmount: null,
    };
    await createExpenses(acc, { kind: "single", data: expense });

    const r = await buildReport(acc, "profitability", { period: "all", includePending: false, projectId: p!.id });
    expect(r.tables[0].rows[0].cells).toMatchObject({
      contract: "2000000.00",
      claimed: "900000.00",
      approved: "750000.00",
      received: "600000.00",
      outstanding: "150000.00",
      cost: "500000.00",
      margin: "250000.00",
      marginPct: 33.3,
    });
    await expect(buildReport(site, "profitability", { period: "all", includePending: false })).rejects.toThrow(ForbiddenError);

    const all = await buildReport(acc, "profitability", { period: "all", includePending: false });
    expect(all.tables.map((t) => t.title)).toEqual(["Client projects", "Overheads (not charged to projects)", "Company result"]);

    const due = await billing.receivablesDue();
    expect(due.total.gte(150000)).toBe(true);
    expect(due.awaiting).toBeGreaterThan(0);
  });
});
