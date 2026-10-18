"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, ComboboxField, DateField, MoneyField, TextareaField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import { CASH_ENTRY_TYPE_LABELS, CASH_ENTRY_TYPES, cashEntrySchema, type CashEntryType } from "@/lib/validation/cash";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES, type PaymentMode } from "@/lib/validation/expenses";
import { EMPLOYEE_TYPE_LABELS, type EmployeeType } from "@/lib/validation/parties";

export type CashFormValues = {
  date: string;
  workerId: number | null;
  type: CashEntryType;
  amount: string;
  paymentMode: PaymentMode;
  projectId: number | null;
  referenceNo: string;
  notes: string;
};

/** RHF values mirror the HTML form: every field is a string ("" = empty). */
type FormValues = Omit<CashFormValues, "workerId" | "projectId"> & { workerId: string; projectId: string };

const HELP: Record<CashEntryType, string> = {
  ISSUED: "Cash or an online transfer given to the employee to spend on company work.",
  RETURNED: "Unspent cash the employee handed back to the company.",
  OPENING: "Cash the employee already held before this system was used (their previous balance in hand).",
};

export function CashForm({
  action,
  deleteAction,
  values,
  options,
  cancelHref,
  currency,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values: CashFormValues;
  options: {
    workers: { id: number; name: string; employeeType: EmployeeType; designation: string | null }[];
    projects: { id: number; code: string; name: string }[];
  };
  cancelHref: string;
  currency: string;
}) {
  const f = useActionForm<FormValues>(action, cashEntrySchema, {
    defaultValues: {
      ...values,
      workerId: values.workerId ? String(values.workerId) : "",
      projectId: values.projectId ? String(values.projectId) : "",
    },
  });
  const type = useWatch({ control: f.form.control, name: "type" });
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cash entry</CardTitle>
          <CardDescription>{HELP[type] ?? HELP.ISSUED}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            name="type"
            label="Entry type"
            required
            options={CASH_ENTRY_TYPES.map((t) => ({ value: t, label: CASH_ENTRY_TYPE_LABELS[t] }))}
          />
          <DateField name="date" label="Date" required />
          <ComboboxField
            name="workerId"
            label="Employee"
            required
            className="sm:col-span-2"
            options={options.workers.map((w) => ({
              value: String(w.id),
              label: w.name,
              hint: w.designation ?? EMPLOYEE_TYPE_LABELS[w.employeeType],
            }))}
            placeholder="Select employee…"
            searchPlaceholder="Search employees…"
          />
          <MoneyField name="amount" label={`Amount (${currency})`} required inputClassName="font-semibold" />
          <ComboboxField
            name="paymentMode"
            label={type === "RETURNED" ? "Returned by" : "Given by"}
            required
            options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          />
          <ComboboxField
            name="projectId"
            label="For project"
            description="Optional — the site the money is meant for"
            options={options.projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
            clearLabel="— Any —"
            placeholder="— Any —"
            searchPlaceholder="Search by code or name…"
          />
          <TextField name="referenceNo" label="Reference" placeholder="Transfer ID, voucher no." inputClassName="font-mono" />
          <TextareaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : deleteAction ? "Save changes" : "Save entry"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete entry"
            title="Delete cash entry?"
            confirmText="Delete this cash entry? The employee's balance will change. The deletion is kept in the activity log."
          />
        )}
      </div>
    </ActionForm>
  );
}
