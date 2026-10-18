"use client";

import Link from "next/link";
import { useWatch } from "react-hook-form";
import { DeleteButton } from "@/components/forms/delete-button";
import { ActionForm, ComboboxField, DateField, MoneyField, TextareaField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { fromPaisa, isMoney, toPaisa } from "@/lib/money";
import { clientBillSchema, clientReceiptSchema, verifyBillSchema } from "@/lib/validation/billing";
import { PAYMENT_MODE_LABELS, PAYMENT_MODES, type PaymentMode } from "@/lib/validation/expenses";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

// ---- Bill ----

export type BillFormValues = { projectId: number | null; date: string; clientRef: string; description: string; claimedAmount: string };

export function BillForm({
  action,
  deleteAction,
  values,
  projects,
  cancelHref,
  currency,
}: {
  action: Action;
  deleteAction?: () => Promise<ActionState>;
  values: BillFormValues;
  projects: { id: number; code: string; name: string; clientName: string | null }[];
  cancelHref: string;
  currency: string;
}) {
  const f = useActionForm<Omit<BillFormValues, "projectId"> & { projectId: string }>(action, clientBillSchema, {
    defaultValues: { ...values, projectId: values.projectId ? String(values.projectId) : "" },
  });
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Bill</CardTitle>
          <CardDescription>
            The amount you claim from the client. Record the client&rsquo;s verified (approved) amount on the bill page once
            they have checked it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ComboboxField
            name="projectId"
            label="Project"
            required
            className="sm:col-span-2"
            options={projects.map((p) => ({ value: String(p.id), label: `${p.code} — ${p.name}`, hint: p.clientName ?? undefined }))}
            placeholder="Select project…"
            searchPlaceholder="Search by code or name…"
          />
          <DateField name="date" label="Bill date" required />
          <TextField name="clientRef" label="Client reference" placeholder="e.g. RA Bill No. 3 / IPC-03" />
          <TextareaField
            name="description"
            label="Description"
            required
            rows={2}
            className="sm:col-span-2"
            placeholder="e.g. Running bill no. 3 — work done up to 30-09-2026"
          />
          <MoneyField name="claimedAmount" label={`Claimed amount (${currency})`} required inputClassName="font-semibold" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : deleteAction ? "Save changes" : "Save bill"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete bill"
            title="Delete this bill?"
            confirmText="Delete this bill? Only bills without receipts can be deleted. The deletion is kept in the activity log."
          />
        )}
      </div>
    </ActionForm>
  );
}

// ---- Verification (inline on the bill page) ----

export function VerifyForm({
  action,
  values,
  claimed,
  currency,
}: {
  action: Action;
  values: { approvedAmount: string; verifiedDate: string; verificationNote: string };
  claimed: string;
  currency: string;
}) {
  const f = useActionForm<typeof values>(action, verifyBillSchema, { defaultValues: values });
  const approved = useWatch({ control: f.form.control, name: "approvedAmount" });
  const cut = approved && isMoney(approved) ? toPaisa(claimed) - toPaisa(approved) : 0n;
  return (
    <ActionForm f={f} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          name="approvedAmount"
          label={`Verified / approved amount (${currency})`}
          required
          description={
            cut > 0n
              ? `${currency} ${formatAmount(fromPaisa(cut))} less than claimed`
              : `Up to ${formatAmount(claimed)} (the claimed amount)`
          }
          inputClassName="font-semibold"
        />
        <DateField name="verifiedDate" label="Verified on" required />
        <TextareaField
          name="verificationNote"
          label="Note"
          rows={2}
          className="sm:col-span-2"
          placeholder="e.g. Verified by the client's engineer; items 4 and 7 reduced"
        />
      </div>
      <Button type="submit" disabled={f.pending}>
        {f.pending ? "Saving…" : "Save verification"}
      </Button>
    </ActionForm>
  );
}

// ---- Receipt ----

export type ReceiptFormValues = {
  date: string;
  amount: string;
  taxDeducted: string;
  paymentMode: PaymentMode;
  referenceNo: string;
  notes: string;
};

export function ReceiptForm({
  action,
  deleteAction,
  values,
  outstanding,
  cancelHref,
  currency,
}: {
  action: Action;
  deleteAction?: () => Promise<ActionState>;
  values: ReceiptFormValues;
  /** Outstanding on the bill, not counting this receipt */
  outstanding: string;
  cancelHref: string;
  currency: string;
}) {
  const f = useActionForm<ReceiptFormValues>(action, clientReceiptSchema, { defaultValues: values });
  const [amount, tax, mode] = useWatch({ control: f.form.control, name: ["amount", "taxDeducted", "paymentMode"] });
  const credited = (amount && isMoney(amount) ? toPaisa(amount) : 0n) + (tax && isMoney(tax) ? toPaisa(tax) : 0n);
  const left = toPaisa(outstanding) - credited;
  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment received</CardTitle>
          <CardDescription>
            Outstanding on this bill: {currency} {formatAmount(outstanding)}. Amount received plus any tax the client
            deducted is credited to the bill.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DateField name="date" label="Date received" required />
          <ComboboxField
            name="paymentMode"
            label="Received by"
            required
            options={PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }))}
          />
          <MoneyField name="amount" label={`Amount received (${currency})`} required inputClassName="font-semibold" />
          <MoneyField
            name="taxDeducted"
            label={`Income tax deducted by client (${currency})`}
            description="Optional — withholding tax the client kept back"
          />
          <TextField
            name="referenceNo"
            label={mode === "CHEQUE" ? "Cheque number" : "Reference"}
            required={mode === "CHEQUE"}
            placeholder="Cheque / transfer ID"
            inputClassName="font-mono"
          />
          <div className="self-end rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            Outstanding after this:{" "}
            <span className={left < 0n ? "font-mono font-semibold text-destructive" : "font-mono font-semibold text-foreground"}>
              {currency} {formatAmount(fromPaisa(left))}
            </span>
          </div>
          <TextareaField name="notes" label="Notes" rows={2} className="sm:col-span-2" />
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : deleteAction ? "Save changes" : "Save receipt"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && (
          <DeleteButton
            action={deleteAction}
            className="sm:ml-auto"
            label="Delete receipt"
            title="Delete this receipt?"
            confirmText="Delete this receipt? The bill's outstanding balance goes back up. The deletion is kept in the activity log."
          />
        )}
      </div>
    </ActionForm>
  );
}
