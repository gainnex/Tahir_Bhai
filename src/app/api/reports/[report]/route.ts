import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { todayPK } from "@/lib/format";
import { parseReportFilters, REPORT_SLUGS, REPORTS, type Report, type ReportSlug } from "@/lib/reports";
import { parseMonth } from "@/lib/payroll";
import { parseExpenseFilters } from "@/lib/validation/expenses";
import { EMPLOYEE_TYPES, type EmployeeType } from "@/lib/validation/parties";
import { getCurrentUser } from "@/server/auth";
import { reportToXlsx } from "@/server/reports/excel";
import { reportToPdf } from "@/server/reports/pdf";
import { wageSheetReport } from "@/server/services/payroll-service";
import { buildReport, expenseListReport } from "@/server/services/report-service";
import { getSettings } from "@/server/services/settings-service";

// GET /api/reports/<slug>?format=xlsx|pdf&<same filters as the page>
// "expenses" exports the expense list with the /expenses filters; "wage-sheet" takes ?month=YYYY-MM.
export async function GET(request: Request, ctx: RouteContext<"/api/reports/[report]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not logged in", { status: 401 });

  const slug = (await ctx.params).report as ReportSlug;
  if (!REPORT_SLUGS.includes(slug)) return new Response("Unknown report", { status: 404 });
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  const sp = Object.fromEntries(url.searchParams.entries());

  let report: Report;
  try {
    if (slug === "expenses") report = await expenseListReport(user, parseExpenseFilters(sp));
    else if (slug === "wage-sheet") {
      const employeeType = EMPLOYEE_TYPES.includes(sp.type as EmployeeType) ? (sp.type as EmployeeType) : undefined;
      const costCenterId = /^\d+$/.test(sp.cc ?? "") ? Number(sp.cc) : undefined;
      report = await wageSheetReport(user, parseMonth(sp.month) ?? todayPK().slice(0, 7), {
        employeeType,
        costCenterId,
        print: format === "pdf",
      });
    } else report = await buildReport(user, slug, parseReportFilters(sp, REPORTS[slug].defaultPeriod, todayPK()));
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response(e.message, { status: 403 });
    if (e instanceof NotFoundError) return new Response(e.message, { status: 404 });
    throw e;
  }

  const settings = await getSettings();
  const fileBase = `${slug}-${todayPK()}`;
  const body =
    format === "pdf"
      ? await reportToPdf(report, settings)
      : await reportToXlsx(report, settings, process.env.APP_URL?.replace(/\/$/, ""));

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.${format}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
