"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { FileSpreadsheet } from "lucide-react";
import {
  ActionForm,
  CheckboxField,
  DateField,
  MoneyField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPKR } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { invoiceAmounts, invoiceSchema, type InvoiceInput } from "@/lib/validation/invoice";

type Values = Record<keyof InvoiceInput, string | boolean>;

/** Posts the form to the invoice route and saves the returned .xlsx. */
async function downloadInvoice(projectId: number, fd: FormData): Promise<ActionState> {
  try {
    const res = await fetch(`/api/projects/${projectId}/invoice`, { method: "POST", body: fd });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ActionState | null;
      return body ?? { error: "Could not create the invoice. Please try again." };
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "invoice.xlsx";
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    return { ok: true, message: `${name} downloaded.` };
  } catch {
    return { error: "Could not reach the server. Check your connection and try again." };
  }
}

export function InvoiceForm({ projectId, values, currency }: { projectId: number; values: Values; currency: string }) {
  const f = useActionForm<Values>((_prev, fd) => downloadInvoice(projectId, fd), invoiceSchema, {
    defaultValues: values,
  });

  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="invoiceNo" label="Invoice no." required inputClassName="font-mono" />
          <DateField name="date" label="Invoice date" required />
          <TextField name="billTitle" label="Bill title" required description="e.g. THIRD RUNNING BILL, FINAL BILL" />
          <TextField name="siteTitle" label="Site / branch heading" required description="The large heading, e.g. UGOKI BRANCH SIALKOT" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amount</CardTitle>
          <CardDescription>This bill = bill % of the work order amount excluding sales tax, plus sales tax.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <MoneyField name="workOrderAmount" label={`Work order amount (${currency})`} required />
          <TextField
            name="billPercent"
            label="Bill %"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 20"
            inputClassName="text-right font-mono tabular-nums"
            description="Share of the work order claimed in this bill"
          />
          <CheckboxField
            name="includesTax"
            label="Work order amount includes sales tax"
            description="The tax is taken out to get the work order amount excluding sales tax."
            className="sm:col-span-2"
          />
          <TextField name="salesTaxLabel" label="Sales tax label" required />
          <TextField
            name="salesTaxRate"
            label="Sales tax rate (%)"
            required
            inputMode="decimal"
            inputClassName="text-right font-mono tabular-nums"
          />
          <AmountPreview currency={currency} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
          <CardDescription>Taken from the project. Changes here apply to this invoice only.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="clientName" label="Client name" />
          <TextField name="clientNtn" label="Client NTN" inputClassName="font-mono" />
          <TextField name="workOrderNo" label="Work order no." inputClassName="font-mono" />
          <TextareaField name="clientAddress" label="Billing address" rows={4} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={f.pending}>
          <FileSpreadsheet /> {f.pending ? "Creating…" : "Create invoice (Excel)"}
        </Button>
        <Link href={`/projects/${projectId}`} className={buttonVariants({ variant: "outline" })}>
          Back to project
        </Link>
      </div>
    </ActionForm>
  );
}

/** Live totals as the user types (the same exact maths as the generated sheet). */
function AmountPreview({ currency }: { currency: string }) {
  const [workOrderAmount, billPercent, salesTaxRate, includesTax] = useWatch({
    name: ["workOrderAmount", "billPercent", "salesTaxRate", "includesTax"],
  }) as [string, string, string, boolean];
  const parsed = invoiceSchema
    .pick({ workOrderAmount: true, billPercent: true, salesTaxRate: true })
    .safeParse({ workOrderAmount, billPercent, salesTaxRate });
  if (!parsed.success) return null;
  const a = invoiceAmounts({ ...parsed.data, includesTax: !!includesTax });

  return (
    <dl className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm sm:col-span-2 sm:grid-cols-4">
      {(
        [
          ["Work order excl. tax", a.workOrderExclTax],
          ["This bill", a.billAmount],
          ["Sales tax", a.salesTax],
          ["Total", a.total],
        ] as const
      ).map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="mt-1 font-mono font-semibold tabular-nums">{formatPKR(value, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}
