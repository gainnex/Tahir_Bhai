import { PageHeader } from "@/components/layout/page-header";
import { toInputDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getCashEntryForEdit, getCashFormOptions } from "@/server/services/cash-service";
import { getSettings } from "@/server/services/settings-service";
import { deleteCashEntryAction, updateCashEntryAction } from "../../../actions";
import { CashForm } from "../../../cash-form";

export const metadata = { title: "Edit cash entry" };

export default async function EditCashEntryPage({ params }: PageProps<"/cash/entry/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const e = await pageData(getCashEntryForEdit(actor, id));
  const [options, settings] = await Promise.all([
    getCashFormOptions({ workerId: e.workerId, projectId: e.projectId }),
    getSettings(),
  ]);
  return (
    <>
      <PageHeader title={`Edit ${e.entryNo}`} description={e.worker.name} />
      <CashForm
        action={updateCashEntryAction.bind(null, id)}
        deleteAction={deleteCashEntryAction.bind(null, id)}
        options={options}
        currency={settings.currencyLabel}
        cancelHref={`/cash/${e.workerId}`}
        values={{
          date: toInputDate(e.date),
          workerId: e.workerId,
          type: e.type,
          amount: e.amount.toFixed(2).replace(/\.00$/, ""),
          paymentMode: e.paymentMode,
          projectId: e.projectId,
          referenceNo: e.referenceNo ?? "",
          notes: e.notes ?? "",
        }}
      />
    </>
  );
}
