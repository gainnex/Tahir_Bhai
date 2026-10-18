import { PageHeader } from "@/components/layout/page-header";
import { todayPK } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { billableProjects } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";
import { createBillAction } from "../actions";
import { BillForm } from "../billing-forms";

export const metadata = { title: "New bill" };

export default async function NewBillPage({ searchParams }: PageProps<"/billing/new">) {
  await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const projectId = typeof sp.projectId === "string" && /^\d+$/.test(sp.projectId) ? Number(sp.projectId) : null;
  const [projects, settings] = await Promise.all([billableProjects(), getSettings()]);
  return (
    <>
      <PageHeader title="New bill" description="A running bill / invoice claimed from the client for one project" />
      <BillForm
        action={createBillAction}
        projects={projects}
        currency={settings.currencyLabel}
        cancelHref="/billing"
        values={{
          projectId: projectId && projects.some((p) => p.id === projectId) ? projectId : null,
          date: todayPK(),
          clientRef: "",
          description: "",
          claimedAmount: "",
        }}
      />
    </>
  );
}
