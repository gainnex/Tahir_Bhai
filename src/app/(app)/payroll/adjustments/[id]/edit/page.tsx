import { PageHeader } from "@/components/layout/page-header";
import { toInputDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getPayAdjustment, payAdjustmentWorkers } from "@/server/services/payroll-service";
import { getSettings } from "@/server/services/settings-service";
import { deletePayAdjustmentAction, updatePayAdjustmentAction } from "../../../actions";
import { AdjustmentForm } from "../../../adjustment-form";

export const metadata = { title: "Edit benefit / deduction" };

export default async function EditPayAdjustmentPage({ params }: PageProps<"/payroll/adjustments/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const adj = await pageData(getPayAdjustment(actor, id));
  const [workers, settings] = await Promise.all([payAdjustmentWorkers(adj.workerId), getSettings()]);
  const date = toInputDate(adj.date);
  return (
    <>
      <PageHeader title={`Edit ${adj.entryNo}`} />
      <AdjustmentForm
        action={updatePayAdjustmentAction.bind(null, id)}
        deleteAction={deletePayAdjustmentAction.bind(null, id, date.slice(0, 7))}
        workers={workers}
        currency={settings.currencyLabel}
        cancelHref={`/payroll?month=${date.slice(0, 7)}`}
        values={{
          date,
          workerId: adj.workerId,
          type: adj.type,
          amount: adj.amount.toFixed(2).replace(/\.00$/, ""),
          notes: adj.notes ?? "",
        }}
      />
    </>
  );
}
