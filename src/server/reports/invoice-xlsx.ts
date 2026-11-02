import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { AppSettings } from "@/server/services/settings-service";
import { readUpload } from "@/server/storage";

// Project invoice -> .xlsx laid out like the client's own invoice (changes/invoice.xlsx):
// sheet 1 the invoice with bank details, sheet 2 the sales tax invoice with the "Bill to" block.
// Amounts are Excel formulas (with the exact values cached) so the sheet can be adjusted by hand.

export type InvoiceDoc = {
  invoiceNo: string;
  date: Date;
  billTitle: string;
  siteTitle: string;
  clientName: string | null;
  clientNtn: string | null;
  clientAddress: string | null;
  workOrderNo: string | null;
  /** Decimal strings, 2 dp */
  workOrderAmount: string;
  workOrderExclTax: string;
  billAmount: string;
  salesTax: string;
  total: string;
  includesTax: boolean;
  /** Percent strings, e.g. "20", "16" */
  billPercent: string;
  salesTaxRate: string;
  salesTaxLabel: string;
};

const COL_WIDTHS = [7.6, 12.6, 17.6, 6.6, 6.6, 6.6, 13.4, 17.6]; // A..H
const ACCOUNTING = '_(* #,##0.00_);_(* (#,##0.00);_(* "-"??_);_(@_)';
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
const MEDIUM: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FF000000" } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const BOX_MEDIUM = { top: MEDIUM, left: MEDIUM, bottom: MEDIUM, right: MEDIUM };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBFBFBF" } };
const TITLE_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFA6A6A6" } };
const WHITE = { argb: "FFFFFFFF" };

type Letterhead = { data: Buffer; extension: "png" | "jpeg"; banner: boolean };

/** The uploaded logo (Settings → Company), else the bundled Line Craft letterhead banner. */
async function loadLetterhead(settings: AppSettings): Promise<Letterhead | null> {
  if (settings.logoPath) {
    try {
      const data = Buffer.from(await readUpload(settings.logoPath));
      return { data, extension: settings.logoPath.endsWith(".png") ? "png" : "jpeg", banner: false };
    } catch {
      // a missing logo file must not break the invoice: fall back to the bundled letterhead
    }
  }
  try {
    const file = path.join(/* turbopackIgnore: true */ process.cwd(), "public", "brand", "letterhead.png");
    return { data: await readFile(file), extension: "png", banner: true };
  } catch {
    return null;
  }
}

/** Pixel size of a PNG / JPEG, for keeping an uploaded logo's aspect ratio. */
function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  let i = 2;
  while (i + 9 < data.length && data[i] === 0xff) {
    const marker = data[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) };
    }
    i += 2 + data.readUInt16BE(i + 2);
  }
  return null;
}

const pct = (p: string) => Number(p) / 100;
const pctFormat = (p: string) => (Number.isInteger(Number(p)) ? "0%" : "0.0###%");

export async function invoiceToXlsx(doc: InvoiceDoc, settings: AppSettings): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.invoice.legalName || settings.companyName;
  wb.created = new Date();

  const letterhead = await loadLetterhead(settings);
  const imageId = letterhead
    ? // exceljs declares its own Buffer type, older than Node's generic one
      wb.addImage({ buffer: letterhead.data as unknown as ExcelJS.Buffer, extension: letterhead.extension })
    : null;

  for (const tax of [false, true]) {
    const ws = wb.addWorksheet(tax ? "Sales Tax Invoice" : "Invoice", {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: "portrait",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        horizontalCentered: true,
        margins: { left: 0.39, right: 0.39, top: 0.39, bottom: 0.87, header: 0.51, footer: 0.24 },
      },
    });
    ws.columns = COL_WIDTHS.map((width) => ({ width }));
    ws.properties.defaultRowHeight = 15;
    buildSheet(ws, doc, settings, tax);

    if (letterhead && imageId !== null) {
      if (letterhead.banner) {
        ws.addImage(imageId, { tl: { col: 0.05, row: 0 }, ext: { width: 686, height: 94 }, editAs: "oneCell" });
      } else {
        // An uploaded logo: right-aligned in the letterhead row, at most 100 × 300 px
        const size = imageSize(letterhead.data) ?? { width: 300, height: 100 };
        const scale = Math.min(100 / size.height, 300 / size.width);
        const width = Math.round(size.width * scale);
        const leftPx = Math.max(0, 640 - width); // columns A..H are ~640 px wide
        ws.addImage(imageId, {
          tl: { col: colAtPx(leftPx), row: 0.15 },
          ext: { width, height: Math.round(size.height * scale) },
          editAs: "oneCell",
        });
      }
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Fractional column index at a pixel offset from the left (Excel: ~7 px per width unit + 5). */
function colAtPx(px: number) {
  let x = 0;
  for (let c = 0; c < COL_WIDTHS.length; c++) {
    const w = Math.round(COL_WIDTHS[c] * 7 + 5);
    if (x + w > px) return c + (px - x) / w;
    x += w;
  }
  return COL_WIDTHS.length - 1;
}

function buildSheet(ws: ExcelJS.Worksheet, doc: InvoiceDoc, settings: AppSettings, tax: boolean) {
  const inv = settings.invoice;
  const font = (size = 11, bold = false): Partial<ExcelJS.Font> => ({ name: "Calibri", size, bold });

  const set = (
    addr: string,
    value: ExcelJS.CellValue,
    style: { font?: Partial<ExcelJS.Font>; numFmt?: string; align?: Partial<ExcelJS.Alignment> } = {},
  ) => {
    const c = ws.getCell(addr);
    c.value = value;
    c.font = style.font ?? font();
    if (style.numFmt) c.numFmt = style.numFmt;
    if (style.align) c.alignment = style.align;
    return c;
  };
  /** Merge a range and draw a border around every cell in it. */
  const box = (range: string, border: Partial<ExcelJS.Borders> = BOX) => {
    const [from, to = from] = range.split(":");
    if (to !== from) ws.mergeCells(range);
    const a = ws.getCell(from);
    const b = ws.getCell(to);
    for (let r = Number(a.row); r <= Number(b.row); r++) {
      for (let col = Number(a.col); col <= Number(b.col); col++) ws.getCell(r, col).border = border;
    }
  };

  // ---- Letterhead + title ----
  ws.mergeCells("A1:H1");
  ws.getRow(1).height = 104.4;
  ws.getRow(2).height = tax ? 60 : 87.6;
  const titleRange = tax ? "D2:H2" : "F2:H2";
  box(titleRange, BOX_MEDIUM);
  set(titleRange.split(":")[0], tax ? "TAX INVOICE" : "INVOICE", {
    font: font(tax ? 36 : 48, true),
    align: { horizontal: "center", vertical: "middle" },
  });

  // ---- Right-hand details block ----
  const top = tax ? 7 : 4;
  const details: [label: string, value: ExcelJS.CellValue, numFmt?: string][] = [
    ["Services:", inv.legalName],
    ["NTN", inv.ntn || null],
    ["", null],
    ["INVOICE #", doc.invoiceNo],
    ["INV. DATE", doc.date, "dd-mmm-yyyy"],
    ["Work Order No.", doc.workOrderNo],
    ["Work Order Amount", Number(doc.workOrderAmount), `"${settings.currencyLabel}" #,##0.00`],
  ];
  // The tax invoice has no blank row between the company and invoice details
  if (tax) details.splice(2, 1);
  let woAmountRow = 0;
  details.forEach(([label, value, numFmt], i) => {
    const r = top + i;
    if (!label) return;
    const head = i < 2; // Services / NTN are smaller, with bold labels
    box(`F${r}:G${r}`);
    set(`F${r}`, label, { font: font(head ? 10 : 11, head), align: { horizontal: "left", vertical: "middle" } });
    box(`H${r}`);
    set(`H${r}`, value ?? "", {
      font: font(head || label.startsWith("Work") ? 10 : 11, !head),
      numFmt,
      align: { horizontal: "right", vertical: "middle", shrinkToFit: true },
    });
    if (label === "Work Order Amount") woAmountRow = r;
  });

  // ---- Bill to (tax invoice) ----
  if (tax) {
    box("A6:D6");
    set("A6", "BILL TO", { font: font(11, true), align: { horizontal: "left" } });
    ws.mergeCells("A7:B7");
    set("A7", "NTN", { font: font(11, true) });
    set("C7", doc.clientNtn ?? "", { font: font(11, true), align: { horizontal: "left" } });
    const lines = [doc.clientName, ...(doc.clientAddress?.split(/\r?\n/) ?? [])]
      .map((l) => l?.trim())
      .filter((l): l is string => !!l);
    // Rows 9..14; anything longer is joined onto the last line
    const rows = lines.length > 6 ? [...lines.slice(0, 5), lines.slice(5).join(", ")] : lines;
    rows.forEach((line, i) => {
      ws.mergeCells(`A${9 + i}:E${9 + i}`);
      set(`A${9 + i}`, line, {
        font: font(i === 0 ? 11 : 10, i === 0),
        align: { horizontal: "left", vertical: "top", wrapText: true },
      });
    });
  }

  // ---- Site heading + bill title ----
  const siteRow = tax ? 14 : 12;
  ws.getRow(siteRow).height = 48;
  box(`F${siteRow}:H${siteRow}`, BOX_MEDIUM);
  set(`F${siteRow}`, doc.siteTitle.toUpperCase(), {
    font: font(20, true),
    align: { horizontal: "center", vertical: "middle", wrapText: true, shrinkToFit: true },
  });
  ws.getRow(siteRow + 1).height = 21.6;
  box(`F${siteRow + 1}:H${siteRow + 1}`, BOX_MEDIUM);
  const billTitle = set(`F${siteRow + 1}`, doc.billTitle.toUpperCase(), {
    font: { ...font(16, true), color: WHITE },
    align: { horizontal: "center", vertical: "middle", wrapText: true },
  });
  billTitle.fill = TITLE_FILL;

  // ---- Line items ----
  let r = siteRow + 3;
  ws.getRow(r).height = 20.1;
  for (const [addr, label] of [
    [`A${r}`, "Sr. No"],
    [`B${r}:E${r}`, "DESCRIPTION"],
    [`F${r}`, "Qty"],
    [`G${r}`, "Unit Rate/ S.Ft"],
    [`H${r}`, "Total Amount"],
  ]) {
    box(addr);
    const c = set(addr.split(":")[0], label, {
      font: { ...font(11, true), color: WHITE },
      align: { horizontal: "center", vertical: "middle" },
    });
    c.fill = HEADER_FILL;
  }
  r++;

  // The tax invoice has the HS code under the header; the invoice a blank row
  if (tax && inv.hsCode) {
    lineRow(r, "HS Code", inv.hsCode, { font: font(11) });
    ws.getRow(r).height = 15;
    r++;
  } else if (!tax) r++;

  const title = doc.billTitle.toUpperCase();
  const woRow = r;
  const billRow = r + 1;
  const taxRow = r + 2;
  const totalRow = r + 3;

  lineRow(woRow, 1, "Work Order Amount (Excluding Sales Tax)", { font: font(12) });
  money(
    woRow,
    doc.includesTax ? `ROUND(H${woAmountRow}/(1+F${taxRow}),2)` : `H${woAmountRow}`,
    doc.workOrderExclTax,
  );

  lineRow(billRow, 2, `${title} (Excluding Sales Tax)`, { font: font(11, true) });
  set(`F${billRow}`, pct(doc.billPercent), { font: font(10, true), numFmt: pctFormat(doc.billPercent), align: { horizontal: "center", vertical: "middle" } });
  money(billRow, `ROUND(H${woRow}*F${billRow},2)`, doc.billAmount, true);

  lineRow(taxRow, "", doc.salesTaxLabel, { font: font(12) });
  set(`F${taxRow}`, pct(doc.salesTaxRate), { font: font(10), numFmt: pctFormat(doc.salesTaxRate), align: { horizontal: "center", vertical: "middle" } });
  money(taxRow, `ROUND(H${billRow}*F${taxRow},2)`, doc.salesTax);

  lineRow(totalRow, "", `${title} TOTAL AMOUNT`, { font: font(11, true) });
  money(totalRow, `SUM(H${billRow}:H${taxRow})`, doc.total, true);
  r = totalRow + 2;

  // ---- Bank details (invoice only) ----
  if (!tax) {
    const bank: [ExcelJS.CellValue, Partial<ExcelJS.Font>, number?][] = [];
    if (inv.bankAccountTitle) {
      bank.push([{ richText: [{ text: "A/c Title: ", font: font() }, { text: inv.bankAccountTitle, font: font(11, true) }] }, font()]);
    }
    if (inv.bankAccountNo) bank.push([`A/c No. ${inv.bankAccountNo}`, font(11, true)]);
    if (inv.bankIban) {
      bank.push([{ richText: [{ text: "IBAN: ", font: font(11, true) }, { text: inv.bankIban, font: font() }] }, font()]);
    }
    if (inv.bankDetails) {
      const lines = inv.bankDetails.split(/\r?\n/).filter((l) => l.trim());
      bank.push([lines.join("\n"), font(), Math.max(20.25, lines.length * 15.2)]);
    }
    for (const [value, f, height] of bank) {
      box(`B${r}:E${r}`);
      set(`B${r}`, value, { font: f, align: { horizontal: "left", vertical: height ? "top" : "middle", wrapText: true } });
      ws.getRow(r).height = height ?? 20.25;
      r++;
    }
    if (bank.length) r += 2;
  }

  // ---- Signature ----
  if (inv.signatory) set(`B${r}`, inv.signatory, { font: font(12, true) });
  if (inv.signatoryTitle) set(`B${r + 1}`, inv.signatoryTitle, { font: font(12) });
  ws.pageSetup.printArea = `A1:H${r + 1}`;

  function lineRow(row: number, sr: string | number, description: string, style: { font: Partial<ExcelJS.Font> }) {
    ws.getRow(row).height = 22.2;
    for (const addr of [`A${row}`, `B${row}:E${row}`, `F${row}`, `G${row}`, `H${row}`]) box(addr);
    set(`A${row}`, sr === "" ? null : sr, { font: font(11), align: { horizontal: "center", vertical: "middle", wrapText: true } });
    set(`B${row}`, description, { font: style.font, align: { horizontal: "left", vertical: "middle", wrapText: true } });
  }

  function money(row: number, formula: string, result: string, bold = false) {
    set(`H${row}`, { formula, result: Number(result) }, { font: font(11, bold), numFmt: ACCOUNTING, align: { vertical: "middle" } });
  }
}
