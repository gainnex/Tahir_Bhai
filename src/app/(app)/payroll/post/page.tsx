import { PageHeader } from "@/components/layout/page-header";
import { todayPK } from "@/lib/format";
import { monthLabel, monthRange, parseMonth } from "@/lib/payroll";
import { requireRole } from "@/server/auth";
import { getPostableWages } from "@/server/services/payroll-service";
import { getSettings } from "@/server/services/settings-service";
import { postWagesAction } from "../actions";
import { PostWagesForm } from "./post-wages-form";

export const metadata = { title: "Post wages" };

export default async function PostWagesPage({ searchParams }: PageProps<"/payroll/post">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const sp = await searchParams;
  const today = todayPK();
  const month = parseMonth(sp.month) ?? today.slice(0, 7);
  const [rows, settings] = await Promise.all([getPostableWages(actor, month), getSettings()]);
  // Paying a past month: default to its last day; the current month: today
  const date = month < today.slice(0, 7) ? monthRange(month).to : today;

  return (
    <>
      <PageHeader
        title={`Post wages — ${monthLabel(month)}`}
        description="Pay balances due from the wage sheet: salaries for monthly staff, daily wages for daily-rate workers"
      />
      <PostWagesForm
        action={postWagesAction}
        month={month}
        date={date}
        currency={settings.currencyLabel}
        rows={rows.map(({ row, problem }) => ({
          id: row.worker.id,
          name: row.worker.name,
          due: row.due.toFixed(2),
          costCenter: row.costCenter ? `${row.costCenter.code} — ${row.costCenter.name}` : null,
          problem,
        }))}
      />
    </>
  );
}
