import { PageHeader } from "@/components/layout/page-header";
import { todayPK } from "@/lib/format";
import { parseMonth } from "@/lib/payroll";
import { PAY_ADJUSTMENT_TYPES, type PayAdjustmentType } from "@/lib/validation/payroll";
import { requireRole } from "@/server/auth";
import { payAdjustmentWorkers } from "@/server/services/payroll-service";
import { getSettings } from "@/server/services/settings-service";
import { createPayAdjustmentAction } from "../../actions";
import { AdjustmentForm } from "../../adjustment-form";

export const metadata = { title: "New benefit / deduction" };

export default async function NewPayAdjustmentPage({ searchParams }: PageProps<"/payroll/adjustments/new">) {
  await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const workerId = typeof sp.workerId === "string" && /^\d+$/.test(sp.workerId) ? Number(sp.workerId) : null;
  const type = PAY_ADJUSTMENT_TYPES.includes(sp.type as PayAdjustmentType) ? (sp.type as PayAdjustmentType) : "BENEFIT";
  const month = parseMonth(sp.month);
  const today = todayPK();
  // Adding from a past month's sheet: date it on that month's last day so it lands in that sheet
  const date = month && month < today.slice(0, 7) ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10) : today;
  const [workers, settings] = await Promise.all([payAdjustmentWorkers(), getSettings()]);
  return (
    <>
      <PageHeader title="New benefit / deduction" description="Benefits, rewards and incentives add to wages; deductions and advance recoveries are taken off" />
      <AdjustmentForm
        action={createPayAdjustmentAction}
        workers={workers}
        currency={settings.currencyLabel}
        cancelHref={`/payroll?month=${date.slice(0, 7)}`}
        values={{
          date,
          workerId: workerId && workers.some((w) => w.id === workerId) ? workerId : null,
          type,
          amount: "",
          notes: "",
        }}
      />
    </>
  );
}
