import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { AppError, ForbiddenError } from "@/lib/errors";
import { invoiceAmounts, invoiceSchema, runningBillTitle } from "@/lib/validation/invoice";
import { createProject } from "@/server/services/project-service";
import { createInvoice, invoiceDefaults } from "@/server/services/invoice-service";
import type { Actor } from "@/server/guards";
import { admin, makeUser } from "./helpers";

let acc: Actor;
let projectId: number;

beforeAll(async () => {
  acc = await makeUser("ACCOUNTANT");
  projectId = (await createProject(await admin(), {
    code: `INV-${Date.now()}`, name: "Ugoki Branch", clientName: "Bank Islami Pakistan Ltd.", projectManager: null,
    location: "Sialkot", startDate: "2026-01-01", endDate: null, status: "ACTIVE", budget: null, notes: null,
    isSubOffice: false, siteInchargeIds: [],
    clientNtn: "2238845-1", clientAddress: "Finance / Account Section\n11th Floor, Executive Tower\nKarachi",
    workOrderNo: "BIPL/84292", workOrderAmount: "12369081",
  }))!.id;
});

describe("invoice amounts", () => {
  it("takes sales tax out of the work order, then applies the bill % and tax (changes/invoice.xlsx)", () => {
    expect(invoiceAmounts({ workOrderAmount: "12369081", includesTax: true, billPercent: "20", salesTaxRate: "16" })).toEqual({
      workOrderExclTax: "10663000.86",
      billAmount: "2132600.17",
      salesTax: "341216.03",
      total: "2473816.20",
    });
    expect(invoiceAmounts({ workOrderAmount: "1000000", includesTax: false, billPercent: "17.5", salesTaxRate: "0" })).toEqual({
      workOrderExclTax: "1000000.00",
      billAmount: "175000.00",
      salesTax: "0.00",
      total: "175000.00",
    });
  });

  it("names running bills", () => {
    expect(runningBillTitle(3)).toBe("THIRD RUNNING BILL");
    expect(runningBillTitle(22)).toBe("22ND RUNNING BILL");
  });
});

describe("project invoice", () => {
  it("pre-fills the form from the project and settings", async () => {
    const { values } = await invoiceDefaults(acc, projectId);
    expect(values).toMatchObject({
      clientName: "Bank Islami Pakistan Ltd.",
      clientNtn: "2238845-1",
      workOrderNo: "BIPL/84292",
      workOrderAmount: "12369081",
      siteTitle: "UGOKI BRANCH SIALKOT",
      billTitle: "FIRST RUNNING BILL",
      salesTaxRate: "16",
    });
  });

  it("is for Admin / Accountant and client projects only", async () => {
    const site = await makeUser("SITE_INCHARGE");
    await expect(invoiceDefaults(site, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    const ho = await db.project.findFirstOrThrow({ where: { isHeadOffice: true } });
    await expect(invoiceDefaults(acc, ho.id)).rejects.toBeInstanceOf(AppError);
  });

  it("builds both sheets with the project details and formulas, and moves on to the next bill", async () => {
    const { values } = await invoiceDefaults(acc, projectId);
    const input = invoiceSchema.parse({ ...values, includesTax: "on", billPercent: "20", invoiceNo: "03-26BR" });
    const { buffer, fileName } = await createInvoice(acc, projectId, input);
    expect(fileName).toBe("Invoice_03-26BR.xlsx");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Invoice", "Sales Tax Invoice"]);

    const inv = wb.getWorksheet("Invoice")!;
    expect(inv.getCell("H7").value).toBe("03-26BR");
    expect(inv.getCell("H9").value).toBe("BIPL/84292");
    expect(inv.getCell("H10").value).toBe(12369081);
    expect(inv.getCell("F12").value).toBe("UGOKI BRANCH SIALKOT");
    expect(inv.getCell("H20").value).toEqual({ formula: "SUM(H18:H19)", result: 2473816.2 });
    expect(inv.getImages()).toHaveLength(1);

    const tax = wb.getWorksheet("Sales Tax Invoice")!;
    expect(tax.getCell("C7").value).toBe("2238845-1");
    expect(tax.getCell("A9").value).toBe("Bank Islami Pakistan Ltd.");
    expect(tax.getCell("A11").value).toBe("11th Floor, Executive Tower");

    const next = await invoiceDefaults(acc, projectId);
    expect(next.previous).toEqual(["03-26BR"]);
    expect(next.values.billTitle).toBe("SECOND RUNNING BILL");
  });
});
