"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useFieldArray, useWatch } from "react-hook-form";
import { CheckCircle2, FileText, ImageIcon, Plus, Split, Trash2, Upload } from "lucide-react";
import { ActionForm, ComboboxField, DateField, MoneyField, TextareaField, TextField } from "@/components/forms/fields";
import { FormStatus } from "@/components/forms/form-status";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LABOUR_HEAD } from "@/lib/defaults";
import { formatAmount } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { compressFormImages } from "@/lib/image-compress";
import { fromPaisa, isMoney, multiplyMoney, toPaisa } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  expenseSchema,
  labourPaymentSchema,
  MAX_ATTACHMENTS,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  splitExpenseSchema,
  type PaymentMode,
} from "@/lib/validation/expenses";
import type { ExpenseFormOptions } from "@/server/services/expense-service";

export type ExpenseFormValues = {
  date: string;
  projectId: number;
  headId: number;
  subheadId: number;
  amount: string;
  paymentMode: PaymentMode;
  chequeNo: string;
  paidTo: string;
  vendorId: number | null;
  workerId: number | null;
  paidFromId: number | null;
  referenceNo: string;
  description: string;
};

type Line = { projectId: string; headId: string; subheadId: string; amount: string };

/** RHF values mirror the HTML form: every field is a string ("" = empty). */
type FormValues = {
  date: string;
  amount: string;
  billTotal: string;
  projectId: string;
  headId: string;
  subheadId: string;
  paymentMode: PaymentMode;
  chequeNo: string;
  vendorId: string;
  workerId: string;
  paidFromId: string;
  paidTo: string;
  referenceNo: string;
  description: string;
  lines: Line[];
};

type Props = {
  mode: "expense" | "labour";
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  options: ExpenseFormOptions;
  values?: ExpenseFormValues; // edit
  attachments?: { id: number; fileName: string; mimeType: string }[];
  defaults?: { projectId?: number; workerId?: number; paidFromId?: number };
  today: string; // YYYY-MM-DD in Pakistan time
  currency: string;
  cancelHref: string;
};

const big = "h-12 text-base sm:h-9 sm:text-sm"; // large touch targets on phones
const blankLine = (): Line => ({ projectId: "", headId: "", subheadId: "", amount: "" });

function moneyOrZero(v: string | undefined) {
  return v && isMoney(v) ? toPaisa(v) : 0n;
}

export function ExpenseForm({ mode, action, options, values, attachments = [], defaults, today, currency, cancelHref }: Props) {
  const isEdit = !!values;
  const labourHead = options.heads.find((h) => h.name === LABOUR_HEAD);
  const workerById = useMemo(() => new Map(options.workers.map((w) => [w.id, w])), [options.workers]);
  const projectIds = new Set(options.projects.map((p) => p.id));

  const startWorker = values?.workerId ?? defaults?.workerId ?? null;
  const startProject =
    values?.projectId ??
    (defaults?.projectId && projectIds.has(defaults.projectId) ? defaults.projectId : undefined) ??
    (startWorker && workerById.get(startWorker)?.defaultProjectId && projectIds.has(workerById.get(startWorker)!.defaultProjectId!)
      ? workerById.get(startWorker)!.defaultProjectId!
      : undefined);
  const defaultLabourSub = labourHead?.subheads.find((s) => s.name === "Daily wages")?.id;

  const [split, setSplit] = useState(false);
  // Labour helper (not submitted): days (or months) × rate
  const startRate = startWorker ? workerById.get(startWorker)?.rate ?? "" : "";
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState(startRate.replace(/\.00$/, ""));
  const [pickedFiles, setPickedFiles] = useState<File[]>([]);

  const schema = mode === "labour" ? labourPaymentSchema : split ? splitExpenseSchema : expenseSchema;
  const f = useActionForm<FormValues>(action, schema, {
    prepare: (fd) => compressFormImages(fd, "files"),
    defaultValues: {
      date: values?.date ?? today,
      amount: values?.amount ?? "",
      billTotal: "",
      projectId: String(startProject ?? ""),
      headId: String(values?.headId ?? (mode === "labour" ? labourHead?.id ?? "" : "")),
      subheadId: String(values?.subheadId ?? (mode === "labour" ? defaultLabourSub ?? "" : "")),
      paymentMode: values?.paymentMode ?? "CASH",
      chequeNo: values?.chequeNo ?? "",
      vendorId: String(values?.vendorId ?? ""),
      workerId: String(startWorker ?? ""),
      // New entries by an employee with a linked login default to their own cash in hand
      paidFromId: String(
        (isEdit
          ? values?.paidFromId
          : options.cashHolders.some((h) => h.id === defaults?.paidFromId)
            ? defaults?.paidFromId
            : options.ownEmployeeId) ?? "",
      ),
      paidTo: values?.paidTo ?? (startWorker ? workerById.get(startWorker)?.name ?? "" : ""),
      referenceNo: values?.referenceNo ?? "",
      description: values?.description ?? "",
      lines: [blankLine(), blankLine()],
    },
  });
  const { control, setValue, getValues, getFieldState, register, formState } = f.form;
  const lines = useFieldArray({ control, name: "lines" });

  const [headId, workerId, paymentMode, billTotal, lineValues] = useWatch({
    control,
    name: ["headId", "workerId", "paymentMode", "billTotal", "lines"],
  });
  const worker = workerId ? workerById.get(Number(workerId)) : undefined;

  // ---- Options for the searchable selects ----
  const projectOptions: ComboboxOption[] = options.projects.map((p) => ({
    value: String(p.id),
    label: `${p.code} — ${p.name}`,
    hint: p.status === "COMPLETED" ? "Completed" : undefined,
  }));
  const headOptions: ComboboxOption[] = options.heads.map((h) => ({
    value: String(h.id),
    label: h.name,
    hint: !h.isActive ? "disabled" : undefined,
  }));
  const subheadOptions = (hid: string): ComboboxOption[] =>
    (options.heads.find((h) => String(h.id) === hid)?.subheads ?? []).map((s) => ({
      value: String(s.id),
      label: s.name,
      hint: !s.isActive ? "disabled" : undefined,
    }));
  const vendorOptions: ComboboxOption[] = options.vendors.map((v) => ({ value: String(v.id), label: v.name }));
  const workerOptions: ComboboxOption[] = options.workers.map((w) => ({ value: String(w.id), label: w.name }));
  const modeOptions: ComboboxOption[] = PAYMENT_MODES.map((m) => ({ value: m, label: PAYMENT_MODE_LABELS[m] }));
  const cashHolderOptions: ComboboxOption[] = options.cashHolders.map((w) => ({
    value: String(w.id),
    label: w.id === options.ownEmployeeId ? `${w.name} (my cash in hand)` : w.name,
  }));

  // ---- Linked-field behaviour (unchanged from the native form) ----
  function recalc(q: string, r: string, rateType = worker?.rateType) {
    if (!q || !isMoney(r) || !/^\d+(\.\d{1,2})?$/.test(q)) return;
    const total = multiplyMoney(r, q);
    setValue("amount", total.replace(/\.00$/, ""), { shouldValidate: formState.isSubmitted });
    // Fill the description until the user types their own
    if (!values?.description && !getFieldState("description").isDirty) {
      const unit = rateType === "MONTHLY" ? (q === "1" ? "month" : "months") : q === "1" ? "day" : "days";
      setValue("description", `Wages: ${q} ${unit} × ${formatAmount(r)}`);
    }
  }

  function pickWorker(id: string) {
    const w = id ? workerById.get(Number(id)) : undefined;
    if (!w) return;
    setValue("vendorId", "");
    setValue("paidTo", w.name, { shouldValidate: formState.isSubmitted });
    if (mode === "labour") {
      setRate(w.rate.replace(/\.00$/, ""));
      if (w.defaultProjectId && projectIds.has(w.defaultProjectId) && !getValues("projectId"))
        setValue("projectId", String(w.defaultProjectId));
      recalc(qty, w.rate, w.rateType);
    }
  }

  function pickVendor(id: string) {
    const v = options.vendors.find((x) => String(x.id) === id);
    if (!v) return;
    setValue("workerId", "");
    setValue("paidTo", v.name, { shouldValidate: formState.isSubmitted });
  }

  const linesTotal = (lineValues ?? []).reduce((s, l) => s + moneyOrZero(l?.amount), 0n);
  const difference = moneyOrZero(billTotal) - linesTotal;
  const linesError = formState.errors.lines?.message ?? formState.errors.lines?.root?.message;

  return (
    <ActionForm f={f} className="max-w-3xl space-y-5 pb-24 sm:pb-0">
      {mode === "labour" && !labourHead && (
        <FormStatus error={`The "${LABOUR_HEAD}" head is missing or disabled. Ask the admin to enable it.`} />
      )}

      {/* ---- Labour: worker first ---- */}
      {mode === "labour" && (
        <Card>
          <CardHeader>
            <CardTitle>Worker</CardTitle>
            <CardDescription>Pick the worker; days × rate fills the amount.</CardDescription>
          </CardHeader>
          <CardContent className="grid items-start gap-4 sm:grid-cols-2">
            <ComboboxField
              name="workerId"
              label="Worker"
              required
              className="sm:col-span-2"
              options={workerOptions}
              placeholder="Select worker…"
              searchPlaceholder="Search workers…"
              onValueChange={pickWorker}
              triggerClassName={big}
            />
            <div className="grid gap-2">
              <Label htmlFor="qty">{worker?.rateType === "MONTHLY" ? "Months" : "Days worked"}</Label>
              <Input
                id="qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => {
                  setQty(e.target.value);
                  recalc(e.target.value, rate);
                }}
                placeholder="e.g. 6"
                className={cn(big, "text-right font-mono tabular-nums")}
              />
              <p className="text-xs text-muted-foreground">Optional helper</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="rate">
                Rate ({currency} / {worker?.rateType === "MONTHLY" ? "month" : "day"})
              </Label>
              <Input
                id="rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  recalc(qty, e.target.value.replace(/,/g, ""));
                }}
                className={cn(big, "text-right font-mono tabular-nums")}
              />
            </div>
            {qty && isMoney(rate) && /^\d+(\.\d{1,2})?$/.test(qty) && (
              <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground sm:col-span-2">
                <span className="font-mono tabular-nums">
                  {qty} × {formatAmount(rate)}
                </span>{" "}
                ={" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {currency} {formatAmount(multiplyMoney(rate, qty))}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Main details ---- */}
      <Card>
        <CardHeader>
          <CardTitle>{mode === "labour" ? "Payment" : "Expense"}</CardTitle>
          {mode === "expense" && !isEdit && (
            <CardAction>
              <Label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                {/* Radix Switch submits split=on, which the server action checks */}
                <Switch name="split" checked={split} onCheckedChange={setSplit} />
                <Split className="size-4 text-muted-foreground" /> Split this bill
              </Label>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DateField name="date" label="Date" required triggerClassName={big} />

          {split ? (
            <MoneyField name="billTotal" label={`Bill total (${currency})`} required inputClassName={cn(big, "font-semibold")} />
          ) : (
            <MoneyField name="amount" label={`Amount (${currency})`} required inputClassName={cn(big, "font-semibold")} />
          )}

          {!split && (
            <>
              <ComboboxField
                name="projectId"
                label="Project"
                required
                className="sm:col-span-2"
                options={projectOptions}
                placeholder="Select project…"
                searchPlaceholder="Search by code or name…"
                triggerClassName={big}
              />
              {mode === "labour" ? (
                <>
                  <input type="hidden" {...register("headId")} />
                  <ComboboxField
                    name="subheadId"
                    label="Labour type"
                    required
                    className="sm:col-span-2"
                    options={subheadOptions(headId)}
                    placeholder={headId ? "Select sub-head…" : "Pick a head first"}
                    disabled={!headId}
                    triggerClassName={big}
                  />
                </>
              ) : (
                <>
                  <ComboboxField
                    name="headId"
                    label="Head"
                    required
                    options={headOptions}
                    placeholder="Select head…"
                    searchPlaceholder="Search heads…"
                    onValueChange={() => setValue("subheadId", "")}
                    triggerClassName={big}
                  />
                  <ComboboxField
                    name="subheadId"
                    label="Sub-head"
                    required
                    options={subheadOptions(headId)}
                    placeholder={headId ? "Select sub-head…" : "Pick a head first"}
                    searchPlaceholder="Search sub-heads…"
                    disabled={!headId}
                    triggerClassName={big}
                  />
                </>
              )}
            </>
          )}

          <ComboboxField
            name="paymentMode"
            label="Payment mode"
            required
            options={modeOptions}
            triggerClassName={big}
          />
          {paymentMode === "CHEQUE" ? (
            <TextField name="chequeNo" label="Cheque number" required inputClassName={cn(big, "font-mono")} />
          ) : (
            <div className="hidden sm:block" />
          )}

          {cashHolderOptions.length > 0 && (
            <ComboboxField
              name="paidFromId"
              label="Paid from"
              description="Pick an employee when they paid out of the cash they hold; it comes off their balance."
              className="sm:col-span-2"
              options={cashHolderOptions}
              clearLabel="Company (paid directly)"
              placeholder="Company (paid directly)"
              searchPlaceholder="Search employees…"
              triggerClassName={big}
            />
          )}

          {mode === "expense" && (
            <>
              <ComboboxField
                name="vendorId"
                label="Vendor"
                description="Optional — fills “Paid to”"
                options={vendorOptions}
                clearLabel="— None —"
                placeholder="— None —"
                searchPlaceholder="Search vendors…"
                onValueChange={pickVendor}
                triggerClassName={big}
              />
              <ComboboxField
                name="workerId"
                label="Worker"
                description="Optional — fills “Paid to”"
                options={workerOptions}
                clearLabel="— None —"
                placeholder="— None —"
                searchPlaceholder="Search workers…"
                onValueChange={pickWorker}
                triggerClassName={big}
              />
            </>
          )}

          <TextField name="paidTo" label="Paid to" required inputClassName={big} />
          <TextField name="referenceNo" label="Reference / bill no." inputClassName={cn(big, "font-mono")} />
          <TextareaField
            name="description"
            label="Description"
            required
            rows={2}
            className="sm:col-span-2"
            inputClassName="text-base sm:text-sm"
          />
        </CardContent>
      </Card>

      {/* ---- Split lines ---- */}
      {split && (
        <Card>
          <CardHeader>
            <CardTitle>Split lines</CardTitle>
            <CardDescription>Allocate the bill across projects and heads. Lines must add up to the bill total.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {linesError && <p className="text-sm text-destructive">{linesError}</p>}
            {lines.fields.map((field, i) => (
              <div
                key={field.id}
                className="grid gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1fr_8rem_auto] sm:items-start"
              >
                <ComboboxField
                  name={`lines.${i}.projectId`}
                  label={`Line ${i + 1} project`}
                  options={projectOptions}
                  placeholder="Select project…"
                  searchPlaceholder="Search by code or name…"
                  triggerClassName={big}
                />
                <ComboboxField
                  name={`lines.${i}.headId`}
                  label="Head"
                  options={headOptions}
                  placeholder="Select head…"
                  searchPlaceholder="Search heads…"
                  onValueChange={() => setValue(`lines.${i}.subheadId`, "")}
                  triggerClassName={big}
                />
                <ComboboxField
                  name={`lines.${i}.subheadId`}
                  label="Sub-head"
                  options={subheadOptions(lineValues?.[i]?.headId ?? "")}
                  placeholder={lineValues?.[i]?.headId ? "Select sub-head…" : "Pick a head first"}
                  disabled={!lineValues?.[i]?.headId}
                  triggerClassName={big}
                />
                <MoneyField name={`lines.${i}.amount`} label="Amount" inputClassName={big} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive sm:mt-6"
                  disabled={lines.fields.length <= 2}
                  onClick={() => lines.remove(i)}
                  aria-label={`Remove line ${i + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => lines.append(blankLine())}>
                <Plus /> Add line
              </Button>
              <div className="space-y-0.5 text-right text-sm">
                <div>
                  Lines total:{" "}
                  <span className="font-mono font-semibold tabular-nums">
                    {currency} {formatAmount(fromPaisa(linesTotal))}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-center justify-end gap-1 font-mono tabular-nums",
                    difference === 0n ? "text-emerald-700" : "text-amber-700",
                  )}
                >
                  {difference === 0n ? (
                    <>
                      <CheckCircle2 className="size-4" /> Matches the bill total
                    </>
                  ) : difference > 0n ? (
                    `${currency} ${formatAmount(fromPaisa(difference))} still to allocate`
                  ) : (
                    `${currency} ${formatAmount(fromPaisa(-difference))} more than the bill total`
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Receipts ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>
            Photo or PDF of the receipt (JPG, PNG, PDF; max 5 MB each, up to {MAX_ATTACHMENTS}). Large photos are reduced
            automatically.{split && " The receipt is attached to every line of the split bill."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {attachments.length > 0 && (
            <ul className="divide-y divide-border/60 rounded-md border border-border/60 text-sm">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  {a.mimeType === "application/pdf" ? (
                    <FileText className="size-4 text-rose-600" />
                  ) : (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  )}
                  <a href={`/api/attachments/${a.id}`} target="_blank" className="truncate text-primary hover:underline">
                    {a.fileName}
                  </a>
                  <Label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <Checkbox name="removeAttachment" value={String(a.id)} /> Remove
                  </Label>
                </li>
              ))}
            </ul>
          )}
          {/* The real input covers the whole drop zone (invisible) so click and drag-and-drop both work. */}
          <div className="relative flex flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/60 hover:bg-muted/40 has-[:focus-visible]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50">
            <Upload className="size-6 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-medium text-primary">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">JPG, PNG or PDF · up to 5 MB each</p>
            <input
              name="files"
              type="file"
              multiple
              accept="image/jpeg,image/png,application/pdf"
              aria-label="Upload receipts"
              onChange={(e) => setPickedFiles(Array.from(e.target.files ?? []))}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
          {pickedFiles.length > 0 && (
            <ul className="space-y-1 text-sm">
              {pickedFiles.map((x, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  {x.type === "application/pdf" ? (
                    <FileText className="size-4 shrink-0 text-rose-600" />
                  ) : (
                    <ImageIcon className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{x.name}</span>
                </li>
              ))}
            </ul>
          )}
          {pickedFiles.some((x) => x.type === "application/pdf" && x.size > 5 * 1024 * 1024) && (
            <p className="text-xs text-destructive">A selected PDF is larger than 5 MB and will be refused.</p>
          )}
        </CardContent>
      </Card>

      {/* Sticky save bar on phones */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-2 border-t border-border bg-card p-3 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button type="submit" size="lg" className="flex-1 sm:flex-none" disabled={f.pending}>
          {f.pending
            ? "Saving…"
            : isEdit
              ? "Save changes"
              : mode === "labour"
                ? "Save payment"
                : split
                  ? `Save ${lines.fields.length} lines`
                  : "Save expense"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </ActionForm>
  );
}
