import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CompanySettingsInput, InvoiceSettingsInput } from "@/lib/validation/settings";
import { assertCan, type Actor } from "@/server/guards";
import { IMAGE_TYPES, saveUpload } from "@/server/storage";
import { logActivity } from "./activity-log";

export type AppSettings = {
  companyName: string;
  companyAddress: string;
  logoPath: string;
  autoApprovePrivileged: boolean;
  currencyLabel: string;
  invoice: InvoiceSettings;
};

/** Company details printed on project invoices (changes/invoice.xlsx). */
export type InvoiceSettings = {
  legalName: string;
  ntn: string;
  salesTaxLabel: string;
  /** Percent, e.g. "16" */
  salesTaxRate: string;
  hsCode: string;
  bankAccountTitle: string;
  bankAccountNo: string;
  bankIban: string;
  /** Bank name, branch and branch code, one per line */
  bankDetails: string;
  signatory: string;
  signatoryTitle: string;
};

const INVOICE_KEYS: Record<keyof InvoiceSettings, string> = {
  legalName: "company_legal_name",
  ntn: "company_ntn",
  salesTaxLabel: "sales_tax_label",
  salesTaxRate: "sales_tax_rate",
  hsCode: "invoice_hs_code",
  bankAccountTitle: "bank_account_title",
  bankAccountNo: "bank_account_no",
  bankIban: "bank_iban",
  bankDetails: "bank_details",
  signatory: "invoice_signatory",
  signatoryTitle: "invoice_signatory_title",
};

/** All settings with defaults filled in for any missing key. */
export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const map = { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  return {
    companyName: map.company_name,
    companyAddress: map.company_address,
    logoPath: map.logo_path,
    autoApprovePrivileged: map.auto_approve_privileged === "true",
    currencyLabel: map.currency_label || "PKR",
    invoice: Object.fromEntries(
      Object.entries(INVOICE_KEYS).map(([field, key]) => [field, map[key] ?? ""]),
    ) as InvoiceSettings,
  };
}

/** Update company settings; `logo` replaces the current logo when given. */
export async function updateCompanySettings(actor: Actor, input: CompanySettingsInput, logo?: File | null) {
  assertCan(actor, "manageSettings");
  const before = await getSettings();

  let logoPath = before.logoPath;
  if (logo && logo.size > 0) logoPath = (await saveUpload(logo, "logo", IMAGE_TYPES)).filePath;
  else if (input.removeLogo) logoPath = "";
  // Old logo files are kept on disk (soft-delete spirit; they are tiny).

  const next: Record<string, string> = {
    company_name: input.companyName,
    company_address: input.companyAddress ?? "",
    logo_path: logoPath,
    auto_approve_privileged: String(input.autoApprovePrivileged),
    currency_label: input.currencyLabel,
  };
  const prev: Record<string, string> = {
    company_name: before.companyName,
    company_address: before.companyAddress,
    logo_path: before.logoPath,
    auto_approve_privileged: String(before.autoApprovePrivileged),
    currency_label: before.currencyLabel,
  };

  await saveChanged(actor, prev, next);
}

/** Update the company details printed on project invoices. */
export async function updateInvoiceSettings(actor: Actor, input: InvoiceSettingsInput) {
  assertCan(actor, "manageSettings");
  const before = (await getSettings()).invoice;
  const prev: Record<string, string> = {};
  const next: Record<string, string> = {};
  for (const [field, key] of Object.entries(INVOICE_KEYS) as [keyof InvoiceSettings, string][]) {
    prev[key] = before[field];
    next[key] = input[field] ?? "";
  }
  await saveChanged(actor, prev, next);
}

/** Upserts the keys whose value changed and logs them as one settings UPDATE. */
async function saveChanged(actor: Actor, prev: Record<string, string>, next: Record<string, string>) {
  const changes: Record<string, { old: string; new: string }> = {};
  for (const key of Object.keys(next)) {
    if (next[key] !== prev[key]) changes[key] = { old: prev[key], new: next[key] };
  }
  if (Object.keys(changes).length === 0) return;

  await db.$transaction(async (tx) => {
    for (const key of Object.keys(changes)) {
      await tx.setting.upsert({ where: { key }, update: { value: next[key] }, create: { key, value: next[key] } });
    }
    await logActivity({ userId: actor.id, action: "UPDATE", entityType: "settings", entityId: 0, changes }, tx);
  });
}
