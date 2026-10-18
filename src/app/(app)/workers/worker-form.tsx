"use client";

import Link from "next/link";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, CheckboxField, ComboboxField, MoneyField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import {
  EMPLOYEE_TYPE_LABELS,
  EMPLOYEE_TYPES,
  RATE_TYPE_LABELS,
  RATE_TYPES,
  TRADE_LABELS,
  TRADES,
  workerSchema,
  type EmployeeType,
  type RateType,
  type Trade,
} from "@/lib/validation/parties";

export type WorkerFormValues = {
  name: string;
  cnic: string;
  phone: string;
  employeeType: EmployeeType;
  designation: string;
  userId: number | null;
  trade: Trade;
  rateType: RateType;
  rate: string;
  defaultProjectId: number | null;
  isActive: boolean;
};

/** RHF values mirror the HTML form: strings ("" = empty), a boolean for the checkbox. */
type FormValues = Omit<WorkerFormValues, "defaultProjectId" | "userId"> & { defaultProjectId: string; userId: string };

export function WorkerForm({
  action,
  deleteAction,
  values,
  projects,
  users,
  cancelHref,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values?: WorkerFormValues;
  projects: { id: number; code: string; name: string }[];
  /** Login accounts not yet linked to another employee */
  users: { id: number; name: string; username: string; isActive: boolean }[];
  cancelHref: string;
}) {
  const f = useActionForm<FormValues>(action, workerSchema, {
    defaultValues: {
      name: values?.name ?? "",
      cnic: values?.cnic ?? "",
      phone: values?.phone ?? "",
      employeeType: values?.employeeType ?? "LABOUR",
      designation: values?.designation ?? "",
      userId: values?.userId ? String(values.userId) : "",
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
          <CardTitle>Employee details</CardTitle>
          <CardDescription>The rate pre-fills the labour payment form.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField name="name" label="Name" required />
          <ComboboxField
            name="employeeType"
            label="Type"
            required
            options={EMPLOYEE_TYPES.map((t) => ({ value: t, label: EMPLOYEE_TYPE_LABELS[t] }))}
          />
          <TextField name="designation" label="Designation" placeholder="e.g. Site supervisor, Accounts officer" />
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
            label="Cost center (project / sub office / head office)"
            description="Where this employee works: their wages and salary are charged here when posted from the wage sheet."
            className="sm:col-span-2"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}` }))}
            clearLabel="— None —"
            placeholder="— None —"
            searchPlaceholder="Search by code or name…"
          />
          <ComboboxField
            name="userId"
            label="Login account"
            description="Link the employee's own login so the expenses they enter are paid from their cash in hand."
            className="sm:col-span-2"
            options={users.map((u) => ({
              value: String(u.id),
              label: `${u.name} (@${u.username})`,
              hint: u.isActive ? undefined : "inactive",
            }))}
            clearLabel="— None —"
            placeholder="— None —"
            searchPlaceholder="Search logins…"
          />
          <CheckboxField
            name="isActive"
            label="Active"
            description="Inactive employees are hidden from the payment and cash forms."
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : values ? "Save changes" : "Create employee"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete employee"
            title="Delete employee?"
            confirmText="Delete this employee? Only possible when they have no payments or cash entries."
          />
        )}
      </div>
    </ActionForm>
  );
}
