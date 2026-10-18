import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { ADVANCE_SUBHEAD, LABOUR_HEAD } from "@/lib/defaults";
import { ForbiddenError } from "@/lib/errors";
import { parseReportFilters, periodDates, type ReportFilters } from "@/lib/reports";
import type { ExpenseInput } from "@/lib/validation/expenses";
import { reportToXlsx } from "@/server/reports/excel";
import { reportToPdf } from "@/server/reports/pdf";
import { getDashboard, periodRange } from "@/server/services/dashboard-service";
import { createExpenses } from "@/server/services/expense-service";
import { createProject } from "@/server/services/project-service";
import { buildReport } from "@/server/services/report-service";
import { getSettings } from "@/server/services/settings-service";
import { admin, makeUser } from "./helpers";

type Actor = Awaited<ReturnType<typeof makeUser>>;
let acc: Actor, site: Actor;
let p1: number, p2: number;
let materials: { id: number; sub: number };
let labour: { id: number; wages: number; advance: number };
let vendorId: number, workerId: number;

const f = (extra: Partial<ReportFilters> = {}): ReportFilters => ({ period: "all", includePending: false, ...extra });

async function add(actor: Actor, extra: Partial<ExpenseInput>) {
  const [id] = await createExpenses(actor, {
    kind: "single",
    data: {
      date: "2026-05-10", projectId: p1, headId: materials.id, subheadId: materials.sub, amount: "100",
      paymentMode: "CASH", chequeNo: null, paidTo: "X", vendorId: null, workerId: null, paidFromId: null, referenceNo: null, description: "d",
      ...extra,
    },
  });
  return id;
}

beforeAll(async () => {
  const a = await admin();
  acc = await makeUser("ACCOUNTANT"); // auto-approve is on in the seed
  site = await makeUser("SITE_INCHARGE");
  const mk = async (name: string, budget: string | null, siteIds: number[] = []) =>
    (await createProject(a, {
      code: `RP-${Date.now()}-${name}`, name, clientName: null, projectManager: null, location: null, startDate: "2026-01-01",
      endDate: null, status: "ACTIVE", budget, notes: null, siteInchargeIds: siteIds,
    }))!.id;
  p1 = await mk("Report One", "1000", [site.id]);
  p2 = await mk("Report Two", null);
  const m = await db.expenseHead.findUniqueOrThrow({ where: { name: "Material Purchasing" }, include: { subheads: true } });
  materials = { id: m.id, sub: m.subheads[0].id };
  const l = await db.expenseHead.findUniqueOrThrow({ where: { name: LABOUR_HEAD }, include: { subheads: true } });
  labour = { id: l.id, wages: l.subheads.find((s) => s.name === "Daily wages")!.id, advance: l.subheads.find((s) => s.name === ADVANCE_SUBHEAD)!.id };
  vendorId = (await db.vendor.create({ data: { name: `Report Vendor ${Date.now()}`, type: "SUPPLIER" } })).id;
  workerId = (await db.worker.create({ data: { name: `Report Worker ${Date.now()}`, trade: "MASON", rateType: "DAILY", rate: "1000" } })).id;

  await add(acc, { date: "2026-03-01", amount: "200", vendorId }); // before range
  await add(acc, { date: "2026-05-10", amount: "300.50", vendorId });
  await add(acc, { date: "2026-05-20", projectId: p2, amount: "1000" });
  await add(acc, { date: "2026-05-11", headId: labour.id, subheadId: labour.wages, amount: "6000", workerId });
  await add(acc, { date: "2026-05-12", headId: labour.id, subheadId: labour.advance, amount: "1500", workerId });
  await add(site, { date: "2026-05-15", amount: "50" }); // pending (site entry)
});

describe("report filters", () => {
  it("resolves period presets and custom dates", () => {
    expect(periodDates("month", "2026-02-14")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodDates("lastmonth", "2026-01-05")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodDates("year", "2026-10-15")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseReportFilters({ from: "2026-05-01", period: "year" }, "month", "2026-10-15").period).toBe("custom");
    expect(parseReportFilters({ pending: "1", projectId: "7" }, "all", "2026-10-15")).toMatchObject({ includePending: true, projectId: 7, period: "all" });
    expect(periodRange("month", "2026-12-20")?.lt.toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("reports", () => {
  it("project cost summary: approved only by default, pending with the toggle; remaining uses spend to date", async () => {
    const r = await buildReport(acc, "project-cost-summary", f({ from: "2026-05-01", to: "2026-05-31", period: "custom" }));
    const row = r.tables[0].rows.find((x) => x.cells.project === "Report One")!;
    expect(row.cells.total).toBe("7800.50"); // 300.50 + 6000 + 1500 (the 200 is in March)
    expect(row.cells.toDate).toBe("8000.50");
    expect(row.cells.remaining).toBe("-7000.50");
    const withPending = await buildReport(acc, "project-cost-summary", f({ from: "2026-05-01", to: "2026-05-31", period: "custom", includePending: true }));
    expect(withPending.tables[0].rows.find((x) => x.cells.project === "Report One")!.cells.total).toBe("7850.50");
  });

  it("project ledger: date order, running total, brought forward", async () => {
    const r = await buildReport(acc, "project-ledger", f({ projectId: p1, from: "2026-05-01", period: "custom" }));
    const rows = r.tables[0].rows;
    expect(rows[0].emphasis).toBe(true); // brought forward 200
    expect(rows[0].cells.running).toBe("200.00");
    expect(rows.slice(1).map((x) => x.cells.date)).toEqual(["2026-05-10", "2026-05-11", "2026-05-12"]);
    expect(rows.at(-1)!.cells.running).toBe("8000.50");
    expect(r.tables[0].totals!.amount).toBe("7800.50");
    const none = await buildReport(acc, "project-ledger", f());
    expect(none.message).toMatch(/Select a project/);
  });

  it("labour payments separate advances; vendor report drills down", async () => {
    const lab = await buildReport(acc, "labour-payments", f({ workerId }));
    expect(lab.tables[0].rows[0].cells).toMatchObject({ wages: "6000.00", advances: "1500.00", total: "7500.00" });
    const ven = await buildReport(acc, "vendors", f({ vendorId }));
    expect(ven.tables[0].rows[0].cells.total).toBe("500.50");
    expect(ven.tables[1].rows).toHaveLength(2);
    const head = await buildReport(acc, "expense-head", f({ headId: labour.id, projectId: p1 }));
    expect(head.tables[0].rows.map((r) => r.cells.amount).sort()).toEqual(["1500.00", "6000.00"]);
  });

  it("site in-charges only see their projects in reports", async () => {
    const r = await buildReport(site, "project-cost-summary", f());
    expect(r.tables[0].rows.every((x) => x.cells.project === "Report One")).toBe(true);
    await expect(buildReport(site, "project-ledger", f({ projectId: p2 }))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("exports to a real .xlsx (numbers + dates) and a PDF", async () => {
    const report = await buildReport(acc, "project-ledger", f({ projectId: p1 }));
    const settings = await getSettings();
    const xlsx = await reportToXlsx(report, settings);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsx as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.getCell("A1").value).toBe(settings.companyName);
    const firstData = ws.getRow(7);
    expect(firstData.getCell(1).value).toBeInstanceOf(Date);
    expect(typeof firstData.getCell(8).value).toBe("number");
    const pdf = await reportToPdf(report, settings);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("dashboard", () => {
  it("is limited to the site in-charge's projects and counts approved only", async () => {
    const d = await getDashboard(site, "all");
    expect(d.limitedToAssigned).toBe(true);
    expect(d.byProject.every((r) => r.project.id === p1)).toBe(true);
    expect(d.periodTotal.toFixed(2)).toBe("8000.50");
    expect(d.pendingCount).toBe(1);
    expect(d.budgetAlerts[0]?.project.id).toBe(p1); // 800% of a 1,000 budget
  });
});
