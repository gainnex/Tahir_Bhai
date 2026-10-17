"use client";

import Link from "next/link";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, ComboboxField, TextareaField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import { VENDOR_TYPE_LABELS, VENDOR_TYPES, vendorSchema, type VendorType } from "@/lib/validation/parties";

export type VendorFormValues = {
  name: string;
  type: VendorType;
  phone: string;
  ntn: string;
  address: string;
  notes: string;
};

export function VendorForm({
  action,
  deleteAction,
  values,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values?: VendorFormValues;
  cancelHref: string;
}) {
  const f = useActionForm<VendorFormValues>(action, vendorSchema, {
    defaultValues: {
      name: values?.name ?? "",
      type: values?.type ?? "SUPPLIER",
      phone: values?.phone ?? "",
      ntn: values?.ntn ?? "",
      address: values?.address ?? "",
      notes: values?.notes ?? "",
    },
  });
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Vendor details</CardTitle>
          <CardDescription>Contact and tax details used on payments and reports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Name" required />
          <ComboboxField
            name="type"
            label="Type"
            required
            options={VENDOR_TYPES.map((t) => ({ value: t, label: VENDOR_TYPE_LABELS[t] }))}
          />
          <TextField
            name="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            placeholder="0300-1234567"
            inputClassName="font-mono tabular-nums"
          />
          <TextField
            name="ntn"
            label="NTN"
            description="Optional"
            placeholder="1234567-8"
            inputClassName="font-mono tabular-nums"
          />
          <TextareaField name="address" label="Address" rows={2} className="sm:col-span-2" />
          <TextareaField name="notes" label="Notes" rows={3} className="sm:col-span-2" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : values ? "Save changes" : "Create vendor"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete vendor"
            title="Delete vendor?"
            confirmText="Delete this vendor? Only possible when no expenses use it."
          />
        )}
      </div>
    </ActionForm>
  );
}
