import { z } from "zod";
import { checkbox, dateField, moneyString, optionalText, requiredText } from "@/lib/forms";
import { fromPaisa, toPaisa } from "@/lib/money";

// A project invoice (changes/invoice.xlsx): the client and work order details come from the
// project, the rest is entered per invoice. Percentages are decimal strings, never floats.

const percent = (label: string, opts: { allowZero?: boolean } = {}) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .transform((v) => v.replace(/%$/, "").trim())
    .refine((v) => /^\d{1,3}(\.\d{1,4})?$/.test(v), `${label} must be a percentage such as 20 or 17.5`)
    .refine((v) => Number(v) <= 100, `${label} cannot be more than 100%`)
    .refine((v) => opts.allowZero || Number(v) > 0, `${label} must be greater than 0`);

export const invoiceSchema = z.object({
  invoiceNo: requiredText("Invoice no.", 40),
  date: dateField("Invoice date"),
  /** e.g. "THIRD RUNNING BILL" */
  billTitle: requiredText("Bill title", 80),
  /** Big heading above the bill title, e.g. "UGOKI BRANCH SIALKOT" */
  siteTitle: requiredText("Site / branch heading", 120),
  clientName: optionalText(150),
  clientNtn: optionalText(30),
  clientAddress: optionalText(500),
  workOrderNo: optionalText(60),
  workOrderAmount: moneyString("Work order amount"),
  /** The work order amount includes sales tax (it is taken out to get the value excl. tax) */
  includesTax: checkbox,
  billPercent: percent("Bill %"),
  salesTaxLabel: requiredText("Sales tax label", 60),
  salesTaxRate: percent("Sales tax rate", { allowZero: true }),
});
export type InvoiceInput = z.output<typeof invoiceSchema>;

const ORDINALS = [
  "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH", "SEVENTH", "EIGHTH", "NINTH", "TENTH",
  "ELEVENTH", "TWELFTH", "THIRTEENTH", "FOURTEENTH", "FIFTEENTH", "SIXTEENTH", "SEVENTEENTH",
  "EIGHTEENTH", "NINETEENTH", "TWENTIETH",
];

/** 3 -> "THIRD RUNNING BILL" */
export function runningBillTitle(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "TH" : ({ 1: "ST", 2: "ND", 3: "RD" } as Record<number, string>)[n % 10] ?? "TH";
  return `${ORDINALS[n - 1] ?? `${n}${suffix}`} RUNNING BILL`;
}

// ---- Amounts (exact: integer paisa and percentages scaled by 10^4, never floats) ----

const PCT_SCALE = 1_000_000n; // 100% = 100 × 10^4

/** "17.5" -> 175000n (percent × 10^4) */
function scaledPercent(p: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,4}))?$/.exec(p.trim());
  if (!m) throw new Error(`Invalid percentage: ${p}`);
  return BigInt(m[1]) * 10_000n + BigInt((m[2] ?? "").padEnd(4, "0"));
}

/** n / d rounded half up (n, d ≥ 0), like Excel's ROUND on positive amounts. */
const roundDiv = (n: bigint, d: bigint) => (2n * n + d) / (2n * d);

/**
 * Work order excl. tax, this bill (bill % of it), sales tax on the bill and the total,
 * each rounded to the paisa — the same steps as the formulas in the generated sheet.
 */
export function invoiceAmounts(input: {
  workOrderAmount: string;
  includesTax: boolean;
  billPercent: string;
  salesTaxRate: string;
}) {
  const rate = scaledPercent(input.salesTaxRate);
  const wo = toPaisa(input.workOrderAmount);
  const woExcl = input.includesTax ? roundDiv(wo * PCT_SCALE, PCT_SCALE + rate) : wo;
  const bill = roundDiv(woExcl * scaledPercent(input.billPercent), PCT_SCALE);
  const tax = roundDiv(bill * rate, PCT_SCALE);
  return {
    workOrderExclTax: fromPaisa(woExcl),
    billAmount: fromPaisa(bill),
    salesTax: fromPaisa(tax),
    total: fromPaisa(bill + tax),
  };
}
