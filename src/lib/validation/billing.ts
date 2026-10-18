import { z } from "zod";
import { dateField, idField, moneyString, optionalMoney, optionalText, requiredText } from "@/lib/forms";
import { toPaisa } from "@/lib/money";
import { PAYMENT_MODES } from "./expenses";

// Client bills (claimed -> verified) and receipts (changes/changes.pdf §6, §7).

export const BILL_STATUSES = ["CLAIMED", "VERIFIED"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];
export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  CLAIMED: "Claimed",
  VERIFIED: "Verified",
};

export const clientBillSchema = z.object({
  projectId: idField("Project"),
  date: dateField("Bill date"),
  clientRef: optionalText(100),
  description: requiredText("Description", 1000),
  claimedAmount: moneyString("Claimed amount"),
});
export type ClientBillInput = z.output<typeof clientBillSchema>;

export const verifyBillSchema = z.object({
  approvedAmount: moneyString("Approved amount"),
  verifiedDate: dateField("Verified on"),
  verificationNote: optionalText(1000),
});
export type VerifyBillInput = z.output<typeof verifyBillSchema>;

export const clientReceiptSchema = z
  .object({
    date: dateField("Date received"),
    amount: moneyString("Amount received"),
    taxDeducted: optionalMoney("Tax deducted"),
    paymentMode: z.enum(PAYMENT_MODES, { error: "Select a payment mode" }),
    referenceNo: optionalText(100),
    notes: optionalText(1000),
  })
  .refine((d) => d.paymentMode !== "CHEQUE" || !!d.referenceNo, {
    message: "Enter the cheque number",
    path: ["referenceNo"],
  })
  .refine(
    (d) => {
      try {
        return !d.taxDeducted || toPaisa(d.taxDeducted) >= 0n;
      } catch {
        return true; // reported on the field itself
      }
    },
    { message: "Tax deducted cannot be negative", path: ["taxDeducted"] },
  );
export type ClientReceiptInput = z.output<typeof clientReceiptSchema>;

/** Payment state of a bill, derived from its approved amount and receipts. */
export type BillPaymentState = "AWAITING_VERIFICATION" | "UNPAID" | "PART_PAID" | "PAID";
export const BILL_PAYMENT_LABELS: Record<BillPaymentState, string> = {
  AWAITING_VERIFICATION: "Awaiting verification",
  UNPAID: "Unpaid",
  PART_PAID: "Part paid",
  PAID: "Paid",
};
