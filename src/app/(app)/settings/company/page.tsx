import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Company settings" description="Used on PDF reports and across the app." />
      <CompanyForm settings={settings} />
    </>
  );
}
