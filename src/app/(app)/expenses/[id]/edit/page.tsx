import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { canEditExpense } from "@/lib/expense-rules";
import { toInputDate, todayPK } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getExpenseDetail, getExpenseFormOptions } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { updateExpenseAction } from "../../actions";
import { ExpenseForm } from "../../expense-form";

export const metadata = { title: "Edit expense" };

export default async function EditExpensePage({ params }: PageProps<"/expenses/[id]/edit">) {
  const actor = await requireUser();
  const id = parseId((await params).id);
  const { expense: e } = await pageData(getExpenseDetail(actor, id));
  if (!canEditExpense(actor, e)) redirect(`/expenses/${id}`);

  const [options, settings] = await Promise.all([
    getExpenseFormOptions(actor, { projectId: e.projectId, headId: e.headId, subheadId: e.subheadId, workerId: e.workerId }),
    getSettings(),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${e.expenseNo}`} />
      {e.status === "APPROVED" && (
        <Notice variant="warning" className="mb-4 max-w-3xl">
          This expense is approved and locked. As Admin you can still change it — every change is recorded in the activity log.
        </Notice>
      )}
      {e.status === "REJECTED" && (
        <Notice variant="destructive" title="Rejected" className="mb-4 max-w-3xl">
          {e.rejectionReason}. Saving your changes sends it for approval again.
        </Notice>
      )}
      {e.splitGroupId && (
        <Notice variant="info" className="mb-4 max-w-3xl">
          This is one line of a split bill. Changes apply to this line only.
        </Notice>
      )}
      <ExpenseForm
        mode="expense"
        action={updateExpenseAction.bind(null, id)}
        options={options}
        attachments={e.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType }))}
        values={{
          date: toInputDate(e.date),
          projectId: e.projectId,
          headId: e.headId,
          subheadId: e.subheadId,
          amount: e.amount.toFixed(2).replace(/\.00$/, ""),
          paymentMode: e.paymentMode,
          chequeNo: e.chequeNo ?? "",
          paidTo: e.paidTo,
          vendorId: e.vendorId,
          workerId: e.workerId,
          referenceNo: e.referenceNo ?? "",
          description: e.description,
        }}
        today={todayPK()}
        currency={settings.currencyLabel}
        cancelHref={`/expenses/${id}`}
      />
    </>
  );
}
