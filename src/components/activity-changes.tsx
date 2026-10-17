// Readable rendering of an activity_logs.changes JSON value ({ field: { old, new } } diffs,
// or a plain snapshot for CREATE/DELETE). Shared by the expense history and the log viewer.

import { formatAmount } from "@/lib/format";

/** field -> id -> display name (e.g. projectId 3 -> "PRJ-001 Gulberg Residency Tower"). */
export type NameMaps = Record<string, Record<number, string>>;

const LABELS: Record<string, string> = {
  projectId: "Project",
  defaultProjectId: "Default project",
  headId: "Head",
  subheadId: "Sub-head",
  vendorId: "Vendor",
  workerId: "Worker",
  paidTo: "Paid to",
  paymentMode: "Payment mode",
  chequeNo: "Cheque no.",
  referenceNo: "Reference",
  rejectionReason: "Rejection reason",
  approvedById: "Approved by",
  approvedAt: "Approved at",
  expenseNo: "Expense no.",
  attachments: "Receipts",
  attachmentsAdded: "Receipts added",
  attachmentsRemoved: "Receipts removed",
  editedWhileApproved: "Edited while approved",
  autoApproved: "Auto-approved",
  isActive: "Active",
  isHeadOffice: "Head office",
  siteInchargeIds: "Site in-charges",
  rateType: "Rate type",
  clientName: "Client",
  startDate: "Start date",
  endDate: "End date",
  mustChangePassword: "Must change password",
};

const HIDDEN = ["id", "deletedAt", "createdById", "splitGroupId", "passwordHash"];
const MONEY = ["amount", "budget", "rate"];

function label(key: string) {
  return LABELS[key] ?? key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

function show(v: unknown, key: string, names?: NameMaps): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number" && names?.[key]?.[v]) return names[key][v];
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (MONEY.includes(key) && (typeof v === "string" || typeof v === "number") && /^-?\d+(\.\d+)?$/.test(String(v))) {
    return formatAmount(String(v));
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(v)) {
    const [y, m, d] = v.slice(0, 10).split("-");
    return `${d}-${m}-${y}`;
  }
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    const pk = new Date(new Date(v).getTime() + 5 * 3600_000).toISOString();
    return `${pk.slice(8, 10)}-${pk.slice(5, 7)}-${pk.slice(0, 4)} ${pk.slice(11, 16)}`;
  }
  if (Array.isArray(v)) return v.map((x) => show(x, key, names)).join(", ") || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isDiff(v: unknown): v is { old: unknown; new: unknown } {
  return !!v && typeof v === "object" && "old" in v && "new" in v;
}

export function ActivityChanges({ changes, compact, names }: { changes: unknown; compact?: boolean; names?: NameMaps }) {
  if (!changes || typeof changes !== "object") return null;
  const entries = Object.entries(changes as Record<string, unknown>).filter(([k]) => !HIDDEN.includes(k));
  if (entries.length === 0) return null;
  const diffs = entries.filter(([, v]) => isDiff(v));
  const plain = entries.filter(([, v]) => !isDiff(v));
  // A CREATE/DELETE snapshot is long; in compact mode only show diffs.
  const shown = compact ? diffs : [...diffs, ...plain];
  if (shown.length === 0) return null;

  return (
    <ul className="space-y-0.5 text-xs text-muted-foreground tabular-nums">
      {shown.map(([k, v]) => (
        <li key={k} className="break-words">
          <span className="font-medium text-foreground">{label(k)}:</span>{" "}
          {isDiff(v) ? (
            <>
              <span className="line-through">{show(v.old, k, names)}</span> →{" "}
              <span className="text-foreground">{show(v.new, k, names)}</span>
            </>
          ) : (
            show(v, k, names)
          )}
        </li>
      ))}
    </ul>
  );
}
