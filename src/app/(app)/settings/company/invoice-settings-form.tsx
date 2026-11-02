"use client";

import { ActionForm, TextareaField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { invoiceSettingsSchema } from "@/lib/validation/settings";
import type { InvoiceSettings } from "@/server/services/settings-service";
import { saveInvoiceSettings } from "../actions";

/** Company details printed on every project invoice (Projects → Create invoice). */
export function InvoiceSettingsForm({ invoice }: { invoice: InvoiceSettings }) {
  const f = useActionForm<InvoiceSettings>(saveInvoiceSettings, invoiceSettingsSchema, { defaultValues: invoice });

  return (
    <ActionForm f={f} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            Printed on the Excel invoices created from a project page. The client&apos;s NTN, address and work order
            come from each project.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="legalName" label="Company legal name" required description="Shown after “Services:”" />
          <TextField name="ntn" label="Company NTN" inputClassName="font-mono" />
          <TextField name="salesTaxLabel" label="Sales tax label" required description="e.g. Sales Tax (PRA)" />
          <TextField
            name="salesTaxRate"
            label="Sales tax rate (%)"
            required
            inputMode="decimal"
            inputClassName="font-mono"
            description="Default for new invoices; can be changed per invoice"
          />
          <TextField name="hsCode" label="HS code line (tax invoice)" className="sm:col-span-2" />
          <TextField name="bankAccountTitle" label="Bank account title" />
          <TextField name="bankAccountNo" label="Account no." inputClassName="font-mono" />
          <TextField name="bankIban" label="IBAN" inputClassName="font-mono" className="sm:col-span-2" />
          <TextareaField
            name="bankDetails"
            label="Bank name & branch"
            rows={3}
            className="sm:col-span-2"
            description="One item per line: bank, branch, branch code"
          />
          <TextField name="signatory" label="Signed by" />
          <TextField name="signatoryTitle" label="Signatory title" />
        </CardContent>
      </Card>

      <Button type="submit" disabled={f.pending}>
        {f.pending ? "Saving…" : "Save invoice details"}
      </Button>
    </ActionForm>
  );
}
