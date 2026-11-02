import Link from "next/link";
import { Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/notice";
import { requireRole } from "@/server/auth";
import { pageData, parseId } from "@/server/params";
import { invoiceDefaults } from "@/server/services/invoice-service";
import { InvoiceForm } from "./invoice-form";

export const metadata = { title: "Create invoice" };

export default async function CreateInvoicePage({ params }: PageProps<"/projects/[id]/invoice">) {
  const actor = await requireRole("ADMIN", "ACCOUNTANT");
  const id = parseId((await params).id);
  const { project, values, previous, settings } = await pageData(invoiceDefaults(actor, id));
  const missing = [
    !project.clientNtn && "client NTN",
    !project.clientAddress && "client address",
    !project.workOrderNo && "work order no.",
    !project.workOrderAmount && "work order amount",
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Create invoice"
        description={
          <>
            <span className="font-mono">{project.code}</span> · {project.name}
            {previous.length > 0 && ` · Earlier invoices: ${previous.join(", ")}`}
          </>
        }
      />
      {missing.length > 0 && (
        <Notice variant="info" className="mb-4 max-w-3xl">
          This project has no {missing.join(", ")} yet. Fill them in below for this invoice, or{" "}
          {actor.role === "ADMIN" ? (
            <Link href={`/projects/${project.id}/edit`} className="font-medium underline">
              add them to the project
            </Link>
          ) : (
            "ask an Admin to add them to the project"
          )}{" "}
          so every invoice picks them up.
        </Notice>
      )}
      <InvoiceForm projectId={project.id} values={values} currency={settings.currencyLabel} />
      {actor.role === "ADMIN" && (
        <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
          <Settings className="mr-1 inline size-4 align-text-bottom" />
          Company NTN, bank details and the signatory come from{" "}
          <Link href="/settings/company" className="text-primary hover:underline">
            Settings → Company
          </Link>
          .
        </p>
      )}
    </>
  );
}
