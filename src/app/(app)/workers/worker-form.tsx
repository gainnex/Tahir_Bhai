"use client";

import Link from "next/link";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, CheckboxField, ComboboxField, MoneyField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import {
  RATE_TYPE_LABELS,
  RATE_TYPES,
  TRADE_LABELS,
  TRADES,
  workerSchema,
  type RateType,
  type Trade,
} from "@/lib/validation/parties";

export type WorkerFormValues = {
  name: string;
  cnic: string;
  phone: string;
  trade: Trade;
  rateType: RateType;
  rate: string;
  defaultProjectId: number | null;
  isActive: boolean;
};

/** RHF values mirror the HTML form: strings ("" = empty), a boolean for the checkbox. */
type FormValues = Omit<WorkerFormValues, "defaultProjectId"> & { defaultProjectId: string };

export function WorkerForm({
  action,
  deleteAction,
  values,
  projects,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values?: WorkerFormValues;
  projects: { id: number; code: string; name: string }[];
  cancelHref: string;
}) {
  const f = useActionForm<FormValues>(action, workerSchema, {
    defaultValues: {
      name: values?.name ?? "",
      cnic: values?.cnic ?? "",
      phone: values?.phone ?? "",
      trade: values?.trade ?? "HELPER",
      rateType: values?.rateType ?? "DAILY",
      rate: values?.rate ?? "",
      defaultProjectId: values?.defaultProjectId ? String(values.defaultProjectId) : "",
      isActive: values?.isActive ?? true,
    },
  });
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Worker details</CardTitle>
          <CardDescription>The rate pre-fills the labour payment form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Name" required />
          <ComboboxField
            name="trade"
            label="Trade"
            required
            options={TRADES.map((t) => ({ value: t, label: TRADE_LABELS[t] }))}
          />
          <TextField
            name="cnic"
            label="CNIC"
            inputMode="numeric"
            placeholder="35202-1234567-1"
            description="Optional, format 12345-1234567-1"
            inputClassName="font-mono tabular-nums"
          />
          <TextField
            name="phone"
            label="Phone"
            type="tel"
            inputMode="tel"
            placeholder="0300-1234567"
            inputClassName="font-mono tabular-nums"
          />
          <ComboboxField
            name="rateType"
            label="Rate type"
            required
            options={RATE_TYPES.map((t) => ({ value: t, label: RATE_TYPE_LABELS[t] }))}
          />
          <MoneyField name="rate" label="Rate (PKR)" required placeholder="1500" description="Per day or per month" />
          <ComboboxField
            name="defaultProjectId"
            label="Default project"
            className="sm:col-span-2"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
            clearLabel="— None —"
            placeholder="— None —"
            searchPlaceholder="Search by code or name…"
          />
          <CheckboxField
            name="isActive"
            label="Active"
            description="Inactive workers are hidden from the labour payment form."
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : values ? "Save changes" : "Create worker"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete worker"
            title="Delete worker?"
            confirmText="Delete this worker? Only possible when they have no payments."
          />
        )}
      </div>
    </ActionForm>
  );
}
