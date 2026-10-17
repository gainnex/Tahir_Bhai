import { db } from "@/lib/db";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import type { CompanySettingsInput } from "@/lib/validation/settings";
import { assertCan, type Actor } from "@/server/guards";
import { IMAGE_TYPES, saveUpload } from "@/server/storage";
import { logActivity } from "./activity-log";

export type AppSettings = {
  companyName: string;
  companyAddress: string;
  logoPath: string;
  autoApprovePrivileged: boolean;
  currencyLabel: string;
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
