import { z } from "zod";
import { checkbox, moneyString, optionalId, optionalText, requiredText } from "@/lib/forms";

// ---- Vendors / payees ----

export const VENDOR_TYPES = ["SUPPLIER", "CONTRACTOR", "OTHER"] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];
export const VENDOR_TYPE_LABELS: Record<VendorType, string> = {
  SUPPLIER: "Supplier",
  CONTRACTOR: "Contractor / Thekedar",
  OTHER: "Other",
};

const phone = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\+?[0-9][0-9 -]{6,18}$/.test(v), "Enter a valid phone number, e.g. 0300-1234567");

export const vendorSchema = z.object({
  name: requiredText("Name", 150),
  type: z.enum(VENDOR_TYPES, { error: "Select a type" }),
  phone,
  ntn: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[0-9][0-9-]{5,14}$/.test(v), "NTN should contain digits and dashes only"),
  address: optionalText(500),
  notes: optionalText(2000),
});
export type VendorInput = z.output<typeof vendorSchema>;

// ---- Workers (labour register) ----

export const TRADES = [
  "MASON",
  "ELECTRICIAN",
  "PLUMBER",
  "HELPER",
  "CARPENTER",
  "AC_TECHNICIAN",
  "CEILING_WORKER",
  "TILE_WORKER",
  "OTHER",
] as const;
export type Trade = (typeof TRADES)[number];
export const TRADE_LABELS: Record<Trade, string> = {
  MASON: "Mason",
  ELECTRICIAN: "Electrician",
  PLUMBER: "Plumber",
  HELPER: "Helper",
  CARPENTER: "Carpenter",
  AC_TECHNICIAN: "AC Technician",
  CEILING_WORKER: "Ceiling Worker",
  TILE_WORKER: "Tile Worker",
  OTHER: "Other",
};

export const RATE_TYPES = ["DAILY", "MONTHLY"] as const;
export type RateType = (typeof RATE_TYPES)[number];
export const RATE_TYPE_LABELS: Record<RateType, string> = { DAILY: "Daily", MONTHLY: "Monthly" };

export const workerSchema = z.object({
  name: requiredText("Name", 150),
  cnic: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{5}-\d{7}-\d$/.test(v), "CNIC format is 12345-1234567-1"),
  phone,
  trade: z.enum(TRADES, { error: "Select a trade" }),
  rateType: z.enum(RATE_TYPES, { error: "Select a rate type" }),
  rate: moneyString("Rate"),
  defaultProjectId: optionalId,
  isActive: checkbox,
});
export type WorkerInput = z.output<typeof workerSchema>;
