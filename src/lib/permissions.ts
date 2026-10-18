// Role rules from docs/FEATURES.md §6. Pure functions — safe to use on server and client.
// The server always enforces these; the UI only uses them to hide things.

export const ROLES = ["ADMIN", "ACCOUNTANT", "SITE_INCHARGE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Director / Admin",
  ACCOUNTANT: "Accountant",
  SITE_INCHARGE: "Site In-charge",
};

const PRIVILEGED: Role[] = ["ADMIN", "ACCOUNTANT"];

export const can = {
  /** Settings, users, expense heads, activity log */
  manageSettings: (r: Role) => r === "ADMIN",
  /** Create / edit projects and assign site in-charges */
  manageProjects: (r: Role) => r === "ADMIN",
  approveExpenses: (r: Role) => PRIVILEGED.includes(r),
  /** Unlock / edit approved expenses (always logged) */
  editApprovedExpenses: (r: Role) => r === "ADMIN",
  manageVendors: (r: Role) => PRIVILEGED.includes(r),
  manageWorkers: (r: Role) => PRIVILEGED.includes(r),
  /** Give / take back employees' cash in hand and see every employee's balance */
  manageCash: (r: Role) => PRIVILEGED.includes(r),
  /** Sees every project; site in-charges only see projects assigned to them */
  seeAllProjects: (r: Role) => PRIVILEGED.includes(r),
};

// Route prefix -> roles allowed. Checked optimistically in src/proxy.ts and authoritatively
// by requireRole() in each page / action. First matching prefix wins; unlisted = any user.
export const ROUTE_ROLES: [prefix: string, roles: Role[]][] = [
  ["/settings", ["ADMIN"]],
  ["/expenses/pending", PRIVILEGED],
  ["/vendors", PRIVILEGED],
  ["/projects/new", ["ADMIN"]],
  ["/workers/new", PRIVILEGED],
  ["/cash/new", PRIVILEGED],
  ["/cash/entry", PRIVILEGED],
];

export function isRouteAllowed(pathname: string, role: Role): boolean {
  const match = ROUTE_ROLES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
  return !match || match[1].includes(role);
}
