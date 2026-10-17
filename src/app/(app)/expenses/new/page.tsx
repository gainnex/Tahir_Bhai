import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { todayPK } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getExpenseFormOptions } from "@/server/services/expense-service";
import { getSettings } from "@/server/services/settings-service";
import { createExpenseAction } from "../actions";
import { ExpenseForm } from "../expense-form";

export const metadata = { title: "New expense" };

export default async function NewExpensePage({ searchParams }: PageProps<"/expenses/new">) {
  const actor = await requireUser();
  const { projectId } = await searchParams;
  const [options, settings] = await Promise.all([getExpenseFormOptions(actor), getSettings()]);

  return (
    <>
      <PageHeader
        title="New expense"
        description={
          settings.autoApprovePrivileged && actor.role !== "SITE_INCHARGE"
            ? "Your entries are approved automatically."
            : "Your entry will be sent for approval."
        }
      />
      {options.projects.length === 0 ? (
        <Notice variant="info">You are not assigned to any open project yet. Ask the admin to assign you.</Notice>
      ) : (
        <ExpenseForm
          mode="expense"
          action={createExpenseAction}
          options={options}
          defaults={{ projectId: typeof projectId === "string" ? Number(projectId) : undefined }}
          today={todayPK()}
          currency={settings.currencyLabel}
          cancelHref="/expenses"
        />
      )}
    </>
  );
}
