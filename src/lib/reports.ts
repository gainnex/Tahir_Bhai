// Report model shared by the on-screen view, the Excel export and the PDF export, so all
// three always show the same numbers. Money cells are decimal strings (never floats);
// date cells are "YYYY-MM-DD".

export type CellValue = string | number | null;
export type ColumnType = "text" | "money" | "date" | "int" | "percent";

export type ReportColumn = { key: string; label: string; type: ColumnType; wide?: boolean };

export type ReportRow = {
  cells: Record<string, CellValue>;
  /** Optional in-app links per column (expense page, drill-down, …). */
  links?: Record<string, string>;
  /** Bold row (e.g. "Brought forward"). */
  emphasis?: boolean;
};

export type ReportTable = {
  title?: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: Record<string, CellValue>;
  empty?: string;
};

export type Report = {
  slug: ReportSlug;
  title: string;
  /** Human description of the filters, printed under the title. */
  subtitle: string;
  tables: ReportTable[];
  /** Shown instead of tables when required input is missing (e.g. no project picked). */
  message?: string;
  landscape?: boolean;
};

// ---- Catalogue ----

export const REPORT_SLUGS = [
  "project-cost-summary",
  "expense-head",
  "project-ledger",
  "labour-payments",
  "vendors",
  "tax",
  "expenses",
] as const;
export type ReportSlug = (typeof REPORT_SLUGS)[number];

export type ReportFilterKey = "project" | "head" | "worker" | "vendor";

export const REPORTS: Record<
  Exclude<ReportSlug, "expenses">,
  { title: string; description: string; filters: ReportFilterKey[]; projectRequired?: boolean; defaultPeriod: Period }
> = {
  "project-cost-summary": {
    title: "Project Cost Summary",
    description: "One row per project with spend by expense head, total, budget and remaining.",
    filters: ["project"],
    defaultPeriod: "month",
  },
  "expense-head": {
    title: "Expense Head Report",
    description: "Spend for one head (or all) broken down by sub-head and by project.",
    filters: ["project", "head"],
    defaultPeriod: "month",
  },
  "project-ledger": {
    title: "Project Ledger",
    description: "Every expense of one project in date order with a running total.",
    filters: ["project"],
    projectRequired: true,
    defaultPeriod: "all",
  },
  "labour-payments": {
    title: "Employee Expenses",
    description: "Wages and payments per worker and per project, with advances shown separately.",
    filters: ["project", "worker"],
    defaultPeriod: "month",
  },
  vendors: {
    title: "Vendor Report",
    description: "Total paid per vendor — pick a vendor to see the individual entries.",
    filters: ["project", "vendor"],
    defaultPeriod: "month",
  },
  tax: {
    title: "Tax Report",
    description: "GST and withholding tax on expenses — totals per payee and every taxed entry, for tax returns.",
    filters: ["project", "vendor"],
    defaultPeriod: "month",
  },
};

// ---- Filters (from the URL) ----

export const PERIODS = ["month", "lastmonth", "year", "all", "custom"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Exclude<Period, "custom">, string> = {
  month: "This month",
  lastmonth: "Last month",
  year: "This year",
  all: "All time",
};

export type ReportFilters = {
  period: Period;
  from?: string;
  to?: string;
  projectId?: number;
  headId?: number;
  workerId?: number;
  vendorId?: number;
  includePending: boolean;
};

const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const posInt = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : undefined);

/** Resolve a period preset to concrete from/to dates (inclusive), given today's date. */
export function periodDates(period: Period, today: string): { from?: string; to?: string } {
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (period === "month") return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  if (period === "lastmonth") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
  }
  if (period === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  return {};
}

export function parseReportFilters(
  sp: Record<string, string | string[] | undefined>,
  defaultPeriod: Period,
  today: string,
): ReportFilters {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
  const from = isoDate(get("from"));
  const to = isoDate(get("to"));
  const requested = PERIODS.find((p) => p === get("period"));
  const period: Period = from || to ? "custom" : (requested ?? defaultPeriod);
  const dates = period === "custom" ? { from, to } : periodDates(period, today);
  return {
    period,
    ...dates,
    projectId: posInt(get("projectId")),
    headId: posInt(get("headId")),
    workerId: posInt(get("workerId")),
    vendorId: posInt(get("vendorId")),
    includePending: get("pending") === "1",
  };
}

/** Filters -> query string (for export links and drill-downs). */
export function filtersToQuery(f: ReportFilters, extra: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  if (f.period === "custom") {
    if (f.from) p.set("from", f.from);
    if (f.to) p.set("to", f.to);
  } else p.set("period", f.period);
  if (f.projectId) p.set("projectId", String(f.projectId));
  if (f.headId) p.set("headId", String(f.headId));
  if (f.workerId) p.set("workerId", String(f.workerId));
  if (f.vendorId) p.set("vendorId", String(f.vendorId));
  if (f.includePending) p.set("pending", "1");
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p.set(k, String(v));
  return p.toString();
}
