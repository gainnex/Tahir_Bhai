import {
  BarChart3,
  Building2,
  HardHat,
  LayoutDashboard,
  Receipt,
  Settings,
  Truck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/permissions";

// Sidebar from docs/SCREENS.md "Navigation". `roles` omitted = everyone.
export type NavLink = { label: string; href: string; roles?: Role[] };
export type NavSection = { label: string; icon: LucideIcon; href?: string; roles?: Role[]; children?: NavLink[] };

const PRIVILEGED: Role[] = ["ADMIN", "ACCOUNTANT"];

export const NAV: NavSection[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/" },
  {
    label: "Expenses",
    icon: Receipt,
    children: [
      { label: "All Expenses", href: "/expenses" },
      { label: "New Expense", href: "/expenses/new" },
      { label: "Pending Approvals", href: "/expenses/pending", roles: PRIVILEGED },
    ],
  },
  { label: "Projects", icon: Building2, href: "/projects" },
  {
    label: "Employees",
    icon: HardHat,
    children: [
      { label: "Employees & Workers", href: "/workers" },
      { label: "Labour Payment", href: "/labour-payment" },
      { label: "Cash in Hand", href: "/cash" },
    ],
  },
  { label: "Vendors", icon: Truck, href: "/vendors", roles: PRIVILEGED },
  {
    label: "Reports",
    icon: BarChart3,
    children: [
      { label: "Project Cost Summary", href: "/reports/project-cost-summary" },
      { label: "Expense Head", href: "/reports/expense-head" },
      { label: "Project Ledger", href: "/reports/project-ledger" },
      { label: "Employee Expenses", href: "/reports/labour-payments" },
      { label: "Vendors", href: "/reports/vendors" },
      { label: "Tax (GST / WHT)", href: "/reports/tax" },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    roles: ["ADMIN"],
    children: [
      { label: "Company", href: "/settings/company" },
      { label: "Users", href: "/settings/users" },
      { label: "Expense Heads", href: "/settings/heads" },
      { label: "Activity Log", href: "/settings/activity-log" },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  return NAV.filter((s) => !s.roles || s.roles.includes(role)).map((s) => ({
    ...s,
    children: s.children?.filter((c) => !c.roles || c.roles.includes(role)),
  }));
}
