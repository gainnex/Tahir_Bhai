import { PageHeader } from "@/components/layout/page-header";
import { toInputDate } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getReceipt } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";
import { deleteReceiptAction, updateReceiptAction } from "../../../actions";
import { ReceiptForm } from "../../../billing-forms";

export const metadata = { title: "Edit receipt" };

export default async function EditReceiptPage({ params }: PageProps<"/billing/receipts/[id]/edit">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const [{ receipt: r, totals }, settings] = await Promise.all([pageData(getReceipt(actor, id)), getSettings()]);
  // Outstanding as if this receipt were not there, so the form can show what is left after it
  const others = totals.outstanding!.plus(r.amount).plus(r.taxDeducted ?? 0);
  return (
    <>
      <PageHeader title={`Edit ${r.receiptNo}`} description={`${r.bill.billNo} · ${r.bill.project.code} ${r.bill.project.name}`} />
      <ReceiptForm
        action={updateReceiptAction.bind(null, id)}
        deleteAction={deleteReceiptAction.bind(null, id)}
        outstanding={others.toFixed(2)}
        currency={settings.currencyLabel}
        cancelHref={`/billing/${r.billId}`}
        values={{
          date: toInputDate(r.date),
          amount: r.amount.toFixed(2).replace(/\.00$/, ""),
          taxDeducted: r.taxDeducted ? r.taxDeducted.toFixed(2).replace(/\.00$/, "") : "",
          paymentMode: r.paymentMode,
          referenceNo: r.referenceNo ?? "",
          notes: r.notes ?? "",
        }}
      />
    </>
  );
}
