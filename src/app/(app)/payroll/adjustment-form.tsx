"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, ComboboxField, DateField, MoneyField, TextareaField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import { EMPLOYEE_TYPE_LABELS, type EmployeeType } from "@/lib/validation/parties";
import {
  PAY_ADJUSTMENT_LABELS,
  PAY_ADJUSTMENT_TYPES,
  payAdjustmentSchema,
  type PayAdjustmentType,
} from "@/lib/validation/payroll";

export type AdjustmentFormValues = {
  date: string;
  workerId: number | null;
  type: PayAdjustmentType;
  amount: string;
  notes: string;
};

/** RHF values mirror the HTML form: every field is a string ("" = empty). */
type FormValues = Omit<AdjustmentFormValues, "workerId"> & { workerId: string };

const HELP: Record<PayAdjustmentType, string> = {
  BENEFIT: "Added to the month's wages, e.g. a medical or transport benefit.",
  REWARD: "Added to the month's wages, e.g. a bonus for good work.",
  INCENTIVE: "Added to the month's wages, e.g. a target or attendance incentive.",
  DEDUCTION: "Taken off the month's wages, e.g. a fine or damage.",
  ADVANCE_RECOVERY: "Taken off the month's wages to repay an advance; it also reduces the employee's advance balance.",
};

export function AdjustmentForm({
  action,
  deleteAction,
  values,
  workers,
  cancelHref,
  currency,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values: AdjustmentFormValues;
  workers: { id: number; name: string; employeeType: EmployeeType; designation: string | null }[];
  cancelHref: string;
  currency: string;
}) {
  const f = useActionForm<FormValues>(action, payAdjustmentSchema, {
    defaultValues: { ...values, workerId: values.workerId ? String(values.workerId) : "" },
  });
  const type = useWatch({ control: f.form.control, name: "type" });
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Benefit or deduction</CardTitle>
          <CardDescription>{HELP[type] ?? HELP.BENEFIT} It counts in the wage sheet for the month of its date.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            name="type"
            label="Type"
            required
            options={PAY_ADJUSTMENT_TYPES.map((t) => ({ value: t, label: PAY_ADJUSTMENT_LABELS[t] }))}
          />
          <DateField name="date" label="Date" required />
          <ComboboxField
            name="workerId"
            label="Employee"
            required
            className="sm:col-span-2"
            options={workers.map((w) => ({
              value: String(w.id),
              label: w.name,
              hint: w.designation ?? EMPLOYEE_TYPE_LABELS[w.employeeType],
            }))}
            placeholder="Select employee…"
            searchPlaceholder="Search employees…"
          />
          <MoneyField name="amount" label={`Amount (${currency})`} required inputClassName="font-semibold" />
          <TextareaField name="notes" label="Reason / notes" rows={2} className="sm:col-span-2" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : deleteAction ? "Save changes" : "Save"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete"
            title="Delete this entry?"
            confirmText="Delete this benefit / deduction? The wage sheet will change. The deletion is kept in the activity log."
          />
        )}
      </div>
    </ActionForm>
  );
}
