import { PageHeader } from "@/components/layout/page-header";
import { toInputDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { billableProjects, getBill } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";
import { deleteBillAction, updateBillAction } from "../../actions";
import { BillForm } from "../../billing-forms";

export const metadata = { title: "Edit bill" };

export default async function EditBillPage({ params }: PageProps<"/billing/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const { bill } = await pageData(getBill(actor, id));
  const [projects, settings] = await Promise.all([billableProjects(bill.projectId), getSettings()]);
  return (
    <>
      <PageHeader title={`Edit ${bill.billNo}`} />
      <BillForm
        action={updateBillAction.bind(null, id)}
        deleteAction={bill.receipts.length === 0 ? deleteBillAction.bind(null, id) : undefined}
        projects={projects}
        currency={settings.currencyLabel}
        cancelHref={`/billing/${id}`}
        values={{
          projectId: bill.projectId,
          date: toInputDate(bill.date),
          clientRef: bill.clientRef ?? "",
          description: bill.description,
          claimedAmount: bill.claimedAmount.toFixed(2).replace(/\.00$/, ""),
        }}
      />
    </>
  );
}
