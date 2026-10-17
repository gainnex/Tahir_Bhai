import { z } from "zod";
import { dateField, idField, moneyString, optionalId, optionalText, requiredText } from "@/lib/forms";
import { toPaisa } from "@/lib/money";

export const PAYMENT_MODES = ["CASH", "BANK_TRANSFER", "CHEQUE", "JAZZCASH", "EASYPAISA"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque",
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
};

export const EXPENSE_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const MAX_ATTACHMENTS = 10;

// Fields shared by a normal expense and every line of a split bill (business rule 1).
const common = {
  date: dateField("Date"),
  paymentMode: z.enum(PAYMENT_MODES, { error: "Select a payment mode" }),
  chequeNo: optionalText(50),
  paidTo: requiredText("Paid to", 150),
  vendorId: optionalId,
  workerId: optionalId,
  referenceNo: optionalText(100),
  description: requiredText("Description", 1000),
};

const chequeRule = <T extends { paymentMode: PaymentMode; chequeNo: string | null }>(d: T) =>
  d.paymentMode !== "CHEQUE" || !!d.chequeNo;
const chequeError = { message: "Cheque number is required for cheque payments", path: ["chequeNo"] };

const allocation = {
  projectId: idField("Project"),
  headId: idField("Head"),
  subheadId: idField("Sub-head"),
  amount: moneyString("Amount"),
};

/** A normal (single) expense. */
export const expenseSchema = z.object({ ...common, ...allocation }).refine(chequeRule, chequeError);
export type ExpenseInput = z.output<typeof expenseSchema>;

/** A split bill: one bill total, ≥ 2 lines that must add up to it exactly (business rule 7). */
export const splitExpenseSchema = z
  .object({
    ...common,
    billTotal: moneyString("Bill total"),
    lines: z.array(z.object(allocation), { error: "Add the split lines" }).min(2, "A split bill needs at least 2 lines"),
  })
  .refine(chequeRule, chequeError)
  .refine(
    (d) => {
      try {
        return d.lines.reduce((sum, l) => sum + toPaisa(l.amount), 0n) === toPaisa(d.billTotal);
      } catch {
        return true; // malformed amounts are already reported on their own fields
      }
    },
    { message: "Split lines must add up exactly to the bill total", path: ["billTotal"] },
  );
export type SplitExpenseInput = z.output<typeof splitExpenseSchema>;

/** Labour payment = a normal expense where a worker is required. */
export const labourPaymentSchema = z
  .object({ ...common, ...allocation, workerId: idField("Worker") })
  .refine(chequeRule, chequeError);

export const rejectSchema = z.object({ reason: requiredText("Rejection reason", 500) });

// ---- List filters (from the URL query string) ----

const optionalPositiveInt = z.preprocess(
  (v) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : undefined),
  z.number().int().positive().optional(),
);
const optionalIsoDate = z.preprocess(
  (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined),
  z.string().optional(),
);
const optionalAmount = z.preprocess((v) => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/,/g, "").trim();
  return /^\d{1,12}(\.\d{1,2})?$/.test(s) ? s : undefined;
}, z.string().optional());

/** Sortable list columns; "-" prefix = descending. Default (absent) is newest first. */
export const EXPENSE_SORTS = ["date", "-date", "expenseNo", "-expenseNo", "amount", "-amount", "paidTo", "-paidTo"] as const;
export type ExpenseSort = (typeof EXPENSE_SORTS)[number];

export const expenseFiltersSchema = z.object({
  from: optionalIsoDate,
  to: optionalIsoDate,
  projectId: optionalPositiveInt,
  headId: optionalPositiveInt,
  subheadId: optionalPositiveInt,
  vendorId: optionalPositiveInt,
  workerId: optionalPositiveInt,
  createdById: optionalPositiveInt,
  status: z.preprocess((v) => (EXPENSE_STATUSES.includes(v as ExpenseStatus) ? v : undefined), z.enum(EXPENSE_STATUSES).optional()),
  paymentMode: z.preprocess((v) => (PAYMENT_MODES.includes(v as PaymentMode) ? v : undefined), z.enum(PAYMENT_MODES).optional()),
  minAmount: optionalAmount,
  maxAmount: optionalAmount,
  q: z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 100) : undefined), z.string().optional()),
  sort: z.preprocess((v) => (EXPENSE_SORTS.includes(v as ExpenseSort) ? v : undefined), z.enum(EXPENSE_SORTS).optional()),
  page: z.preprocess((v) => (typeof v === "string" && /^\d+$/.test(v) ? Math.max(1, Number(v)) : 1), z.number()),
});
export type ExpenseFilters = z.output<typeof expenseFiltersSchema>;

/** Next.js searchParams -> validated filters (invalid values are ignored). */
export function parseExpenseFilters(sp: Record<string, string | string[] | undefined>): ExpenseFilters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return expenseFiltersSchema.parse(flat);
}
