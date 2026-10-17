import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/format";
import type { CellValue, Report, ReportColumn } from "@/lib/reports";
import type { AppSettings } from "@/server/services/settings-service";

// Report -> .xlsx (one sheet per table). Money cells are real numbers with a thousands
// format so totals can be re-checked in Excel; the decimal strings are exact to 2 dp.

const MONEY_INT = "#,##0;-#,##0";
const MONEY_DEC = "#,##0.00;-#,##0.00";

function sheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 28) || "Report";
  let n = 2;
  let candidate = base;
  while (used.has(candidate)) candidate = `${base} ${n++}`;
  used.add(candidate);
  return candidate;
}

function writeCell(cell: ExcelJS.Cell, col: ReportColumn, value: CellValue, link?: string) {
  if (value === null || value === undefined || value === "") return;
  switch (col.type) {
    case "money": {
      const s = String(value);
      cell.value = Number(s);
      cell.numFmt = /\.(?!00$)\d+$/.test(s) ? MONEY_DEC : MONEY_INT;
      break;
    }
    case "date": {
      const s = String(value);
      cell.value = new Date(`${s}T00:00:00.000Z`);
      cell.numFmt = "dd-mm-yyyy";
      break;
    }
    case "percent":
      cell.value = Number(value) / 100;
      cell.numFmt = "0.0%";
      break;
    case "int":
      cell.value = Number(value);
      break;
    default:
      cell.value = link ? { text: String(value), hyperlink: link } : String(value);
      if (link) cell.font = { color: { argb: "FF1E3A8A" }, underline: true };
  }
  if (col.type !== "text" && col.type !== "date") cell.alignment = { horizontal: "right" };
}

export async function reportToXlsx(report: Report, settings: AppSettings, appUrl?: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.companyName;
  wb.created = new Date();
  const used = new Set<string>();
  const tables = report.tables.length ? report.tables : [{ columns: [], rows: [] }];

  for (const table of tables) {
    const ws = wb.addWorksheet(sheetName(table.title ?? report.title, used), {
      pageSetup: { orientation: report.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    const nCols = Math.max(1, table.columns.length);

    ws.addRow([settings.companyName]).font = { bold: true, size: 14 };
    ws.addRow([table.title ? `${report.title} — ${table.title}` : report.title]).font = { bold: true, size: 12 };
    ws.addRow([report.subtitle]).font = { color: { argb: "FF64748B" } };
    ws.addRow([`Generated ${formatDateTime(new Date())}`]).font = { color: { argb: "FF64748B" }, size: 9 };
    for (let r = 1; r <= 4; r++) ws.mergeCells(r, 1, r, nCols);
    ws.addRow([]);

    if (report.message) {
      ws.addRow([report.message]);
      continue;
    }

    const header = ws.addRow(table.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell, i) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
      if (!["text", "date"].includes(table.columns[i - 1].type)) cell.alignment = { horizontal: "right" };
    });
    const headerRow = header.number;

    for (const row of table.rows) {
      const r = ws.addRow([]);
      table.columns.forEach((col, i) => {
        const href = row.links?.[col.key];
        writeCell(r.getCell(i + 1), col, row.cells[col.key] ?? null, href && appUrl ? appUrl + href : undefined);
      });
      if (row.emphasis) r.font = { bold: true };
    }
    if (table.rows.length === 0) ws.addRow([table.empty ?? "No data."]).font = { italic: true, color: { argb: "FF64748B" } };

    if (table.totals) {
      const t = ws.addRow([]);
      table.columns.forEach((col, i) => writeCell(t.getCell(i + 1), col, table.totals![col.key] ?? null));
      t.font = { bold: true };
      t.eachCell((cell) => (cell.border = { top: { style: "thin" }, bottom: { style: "double" } }));
    }

    // Column widths from content
    table.columns.forEach((col, i) => {
      const lens = [col.label.length, ...table.rows.slice(0, 500).map((r) => String(r.cells[col.key] ?? "").length + (col.type === "money" ? 4 : 0))];
      ws.getColumn(i + 1).width = Math.min(col.wide ? 60 : 30, Math.max(10, ...lens) + 2);
    });
    ws.views = [{ state: "frozen", ySplit: headerRow }];
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
