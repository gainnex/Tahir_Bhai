import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";
import { CompanyForm } from "./company-form";
import { InvoiceSettingsForm } from "./invoice-settings-form";

export const metadata = { title: "Company settings" };

export default async function CompanySettingsPage() {
  await requireRole("ADMIN");
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Company settings" description="Used on PDF reports, invoices and across the app." />
      <CompanyForm settings={settings} />
      <div className="mt-8">
        <InvoiceSettingsForm invoice={settings.invoice} />
      </div>
    </>
  );
}
