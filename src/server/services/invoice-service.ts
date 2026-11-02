import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseInputDate, todayPK } from "@/lib/format";
import { invoiceAmounts, runningBillTitle, type InvoiceInput } from "@/lib/validation/invoice";
import { invoiceToXlsx, type InvoiceDoc } from "@/server/reports/invoice-xlsx";
import { assertCan, type Actor } from "@/server/guards";
import { logActivity } from "./activity-log";
import { assertProjectAccess } from "./project-service";
import { getSettings } from "./settings-service";

// Auto invoice per project (changes/invoice.xlsx). The client's name, NTN, address and the work
// order are taken from the project, the company / bank details from Settings → Company; the user
// only enters the bill % (and can adjust anything else) before the .xlsx is generated.
// Admin / Accountant only, like client billing.

const ENTITY = "project_invoice";

async function billableProject(actor: Actor, projectId: number) {
  assertCan(actor, "manageBilling");
  const project = await assertProjectAccess(actor, projectId);
  if (project.isHeadOffice || project.isSubOffice) {
    throw new AppError("Invoices are only for client projects, not for the head office or sub offices.");
  }
  return project;
}

/** Invoice numbers already generated for a project (from the activity log). */
async function previousInvoices(projectId: number) {
  const logs = await db.activityLog.findMany({
    where: { entityType: ENTITY, entityId: projectId },
    select: { changes: true },
    orderBy: { id: "asc" },
  });
  const numbers = new Set<string>();
  for (const l of logs) {
    const no = (l.changes as { invoiceNo?: unknown } | null)?.invoiceNo;
    if (typeof no === "string") numbers.add(no);
  }
  return [...numbers];
}

/** The invoice form, pre-filled from the project, its earlier invoices / bills and the settings. */
export async function invoiceDefaults(actor: Actor, projectId: number) {
  const project = await billableProject(actor, projectId);
  const [settings, previous, bills] = await Promise.all([
    getSettings(),
    previousInvoices(projectId),
    db.clientBill.count({ where: { projectId, deletedAt: null } }),
  ]);
  const seq = Math.max(previous.length, bills) + 1;
  const today = todayPK();

  const values: Record<keyof InvoiceInput, string | boolean> = {
    invoiceNo: `${String(seq).padStart(2, "0")}-${today.slice(2, 4)}-${project.code}`,
    date: today,
    billTitle: runningBillTitle(seq),
    siteTitle: [project.name, project.location].filter(Boolean).join(" ").toUpperCase(),
    clientName: project.clientName ?? "",
    clientNtn: project.clientNtn ?? "",
    clientAddress: project.clientAddress ?? "",
    workOrderNo: project.workOrderNo ?? "",
    // No work order amount yet: fall back to the contract value / budget
    workOrderAmount: (project.workOrderAmount ?? project.budget)?.toFixed(2).replace(/\.00$/, "") ?? "",
    includesTax: true,
    billPercent: "",
    salesTaxLabel: settings.invoice.salesTaxLabel,
    salesTaxRate: settings.invoice.salesTaxRate,
  };
  return { project, values, previous, settings };
}

/** Builds the .xlsx and records it in the activity log. */
export async function createInvoice(actor: Actor, projectId: number, input: InvoiceInput) {
  const project = await billableProject(actor, projectId);
  const settings = await getSettings();
  const doc: InvoiceDoc = {
    ...input,
    ...invoiceAmounts(input),
    date: parseInputDate(input.date),
  };
  const buffer = await invoiceToXlsx(doc, settings);

  await logActivity({
    userId: actor.id,
    action: "CREATE",
    entityType: ENTITY,
    entityId: project.id,
    changes: {
      invoiceNo: input.invoiceNo,
      date: input.date,
      billTitle: input.billTitle,
      billPercent: input.billPercent,
      billAmount: doc.billAmount,
      salesTax: doc.salesTax,
      total: doc.total,
    },
  });

  return { buffer, fileName: `Invoice_${input.invoiceNo.replace(/[^\w.-]+/g, "_")}.xlsx` };
}
