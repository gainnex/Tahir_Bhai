import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { todayPK } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { getBill } from "@/server/services/billing-service";
import { getSettings } from "@/server/services/settings-service";
import { createReceiptAction } from "../../../actions";
import { ReceiptForm } from "../../../billing-forms";

export const metadata = { title: "Record receipt" };

export default async function NewReceiptPage({ params }: PageProps<"/billing/[id]/receipts/new">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const [{ bill, totals }, settings] = await Promise.all([pageData(getBill(actor, id)), getSettings()]);
  if (bill.status !== "VERIFIED") redirect(`/billing/${id}`);
  return (
    <>
      <PageHeader
        title={`Record receipt — ${bill.billNo}`}
        description={`${bill.project.code} ${bill.project.name}${bill.project.clientName ? ` · ${bill.project.clientName}` : ""}`}
      />
      <ReceiptForm
        action={createReceiptAction.bind(null, id)}
        outstanding={totals.outstanding!.toFixed(2)}
        currency={settings.currencyLabel}
        cancelHref={`/billing/${id}`}
        values={{
          date: todayPK(),
          amount: totals.outstanding!.toFixed(2).replace(/\.00$/, ""),
          taxDeducted: "",
          paymentMode: "BANK_TRANSFER",
          referenceNo: "",
          notes: "",
        }}
      />
    </>
  );
}
