import { PageHeader } from "@/components/layout/page-header";
import { todayPK } from "@/lib/format";
import { CASH_ENTRY_TYPES, type CashEntryType } from "@/lib/validation/cash";
import { requireRole } from "@/server/auth";
import { getCashFormOptions } from "@/server/services/cash-service";
import { getSettings } from "@/server/services/settings-service";
import { createCashEntryAction } from "../actions";
import { CashForm } from "../cash-form";

export const metadata = { title: "New cash entry" };

export default async function NewCashEntryPage({ searchParams }: PageProps<"/cash/new">) {
  await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const workerId = typeof sp.workerId === "string" && /^\d+$/.test(sp.workerId) ? Number(sp.workerId) : null;
  const type = CASH_ENTRY_TYPES.includes(sp.type as CashEntryType) ? (sp.type as CashEntryType) : "ISSUED";
  const [options, settings] = await Promise.all([getCashFormOptions(), getSettings()]);
  return (
    <>
      <PageHeader title="New cash entry" description="Give funds to an employee, take back unspent cash, or record their previous balance" />
      <CashForm
        action={createCashEntryAction}
        options={options}
        currency={settings.currencyLabel}
        cancelHref={workerId ? `/cash/${workerId}` : "/cash"}
        values={{
          date: todayPK(),
          workerId: workerId && options.workers.some((w) => w.id === workerId) ? workerId : null,
          type,
          amount: "",
          paymentMode: "CASH",
          projectId: null,
          referenceNo: "",
          notes: "",
        }}
      />
    </>
  );
}
