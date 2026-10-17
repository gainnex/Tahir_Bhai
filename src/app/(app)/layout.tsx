import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings-service";

// Every page in this group needs a logged-in user (who has set their own password).
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [settings, pendingCount, cookieStore] = await Promise.all([
    getSettings(),
    can.approveExpenses(user.role)
      ? db.expense.count({ where: { status: "PENDING", deletedAt: null } })
      : Promise.resolve(0),
    cookies(),
  ]);
  // Desktop sidebar collapsed/expanded state, remembered by the shadcn sidebar in a cookie
  const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <AppShell
      user={{ name: user.name, role: user.role }}
      companyName={settings.companyName}
      pendingCount={pendingCount}
      defaultOpen={sidebarOpen}
    >
      {children}
    </AppShell>
  );
}
