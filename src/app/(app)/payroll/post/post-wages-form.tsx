"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { ActionForm, CheckboxGroupField, ComboboxField, DateField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { fromPaisa, toPaisa } from "@/lib/money";
import { PAYMENT_MODE_LABELS, type PaymentMode } from "@/lib/validation/expenses";
import { postWagesSchema, WAGE_PAYMENT_MODES } from "@/lib/validation/payroll";

export type DueRow = { id: number; name: string; due: string; costCenter: string | null; problem: string | null };

type FormValues = { month: string; date: string; paymentMode: PaymentMode; workerIds: string[] };

export function PostWagesForm({
  action,
  month,
  date,
  rows,
  currency,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  month: string;
  date: string;
  rows: DueRow[];
  currency: string;
}) {
  const ready = rows.filter((r) => !r.problem);
  const f = useActionForm<FormValues>(action, postWagesSchema, {
    defaultValues: { month, date, paymentMode: "BANK_TRANSFER", workerIds: ready.map((r) => String(r.id)) },
  });
  const selected = useWatch({ control: f.form.control, name: "workerIds" }) ?? [];
  const total = rows.filter((r) => selected.includes(String(r.id))).reduce((s, r) => s + toPaisa(r.due), 0n);

  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <input type="hidden" {...f.form.register("month")} />
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>
            Each employee gets one labour payment for their balance due, charged to their cost center.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DateField name="date" label="Payment date" required />
          <ComboboxField
            name="paymentMode"
            label="Paid by"
            required
            description="Cheques need a number each — enter those as single labour payments."
            options={WAGE_PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Employees</CardTitle>
          <CardDescription>
            Selected: {selected.length} ·{" "}
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {currency} {formatAmount(fromPaisa(total))}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ready.length > 0 ? (
            <CheckboxGroupField
              name="workerIds"
              label={null}
              options={ready.map((r) => ({
                value: String(r.id),
                label: `${r.name} — ${formatAmount(r.due)}`,
                hint: r.costCenter ?? undefined,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Nobody is ready to be paid.</p>
          )}
          {rows.some((r) => r.problem) && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="mb-1 font-medium">Not included</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {rows
                  .filter((r) => r.problem)
                  .map((r) => (
                    <li key={r.id}>
                      {r.name} ({formatAmount(r.due)}): {r.problem}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={f.pending || ready.length === 0}>
          {f.pending ? "Posting…" : `Post ${selected.length} payment${selected.length === 1 ? "" : "s"}`}
        </Button>
        <Link href={`/payroll?month=${month}`} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}
