import { z } from "zod";
import { dateField, idField, moneyString, optionalId, optionalText } from "@/lib/forms";
import { PAYMENT_MODES } from "./expenses";

// Employee cash in hand (changes/changes.pdf §1: "record of expenses by employees —
// cash, online transfer, previous balance in hand").

export const CASH_ENTRY_TYPES = ["ISSUED", "RETURNED", "OPENING"] as const;
export type CashEntryType = (typeof CASH_ENTRY_TYPES)[number];
export const CASH_ENTRY_TYPE_LABELS: Record<CashEntryType, string> = {
  ISSUED: "Funds given",
  RETURNED: "Returned to company",
  OPENING: "Previous balance in hand",
};

export const cashEntrySchema = z.object({
  date: dateField("Date"),
  workerId: idField("Employee"),
  type: z.enum(CASH_ENTRY_TYPES, { error: "Select an entry type" }),
  amount: moneyString("Amount"),
  paymentMode: z.enum(PAYMENT_MODES, { error: "Select a payment mode" }),
  projectId: optionalId,
  referenceNo: optionalText(100),
  notes: optionalText(1000),
});
export type CashEntryInput = z.output<typeof cashEntrySchema>;
