import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { todayPK } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getExpenseFormOptions } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { createLabourPaymentAction } from "../expenses/actions";
import { ExpenseForm } from "../expenses/expense-form";

export const metadata = { title: "Labour payment" };

export default async function LabourPaymentPage({ searchParams }: PageProps<"/labour-payment">) {
  const actor = await requireUser();
  const { workerId } = await searchParams;
  const [options, settings] = await Promise.all([getExpenseFormOptions(actor), getSettings()]);

  return (
    <>
      <PageHeader title="Labour payment" description="Pay a worker — saved as an expense under the Labour head." />
      {options.workers.length === 0 ? (
        <Notice variant="info" className="max-w-3xl">
          There are no active workers. Add workers under{" "}
          <Link href="/workers" className="font-medium underline underline-offset-4">
            Labour → Workers
          </Link>{" "}
          first.
        </Notice>
      ) : (
        <ExpenseForm
          mode="labour"
          action={createLabourPaymentAction}
          options={options}
          defaults={{ workerId: typeof workerId === "string" ? Number(workerId) : undefined }}
          today={todayPK()}
          currency={settings.currencyLabel}
          cancelHref="/workers"
        />
      )}
    </>
  );
}
