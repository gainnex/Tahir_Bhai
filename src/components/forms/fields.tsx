"use client";

import type * as React from "react";
import { useFormContext, type FieldValues } from "react-hook-form";
import { FormStatus } from "@/components/forms/form-status";
import type { ActionFormApi } from "@/components/forms/use-action-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// shadcn <Form> field building blocks for useActionForm forms. Each one renders
// FormItem > FormLabel > FormControl > FormDescription/FormMessage and sets the native `name`,
// so the submitted FormData is the same as the old hand-written inputs produced.

/** <Form> provider + <form> element wired to useActionForm, with the form-level banner on top. */
export function ActionForm<T extends FieldValues>({
  f,
  className,
  children,
  showStatus = true,
}: {
  f: ActionFormApi<T>;
  className?: string;
  children: React.ReactNode;
  showStatus?: boolean;
}) {
  // Destructured so the compiler does not treat the whole hook result as a ref
  const { form, bindForm, onSubmit, formError, success } = f;
  return (
    <Form {...form}>
      <form ref={bindForm} onSubmit={onSubmit} noValidate className={className}>
        {showStatus && <FormStatus error={formError} success={success} />}
        {children}
      </form>
    </Form>
  );
}

type Common = {
  name: string;
  label: React.ReactNode;
  required?: boolean;
  description?: React.ReactNode;
  className?: string;
};

function Label({ label, required }: { label: React.ReactNode; required?: boolean }) {
  return (
    <FormLabel>
      {label}
      {required && <span className="text-destructive">*</span>}
    </FormLabel>
  );
}

export function TextField({
  name,
  label,
  required,
  description,
  className,
  inputClassName,
  onValueChange,
  ...input
}: Common &
  Omit<React.ComponentProps<typeof Input>, "name" | "className"> & {
    inputClassName?: string;
    onValueChange?: (v: string) => void;
  }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <Label label={label} required={required} />
          <FormControl>
            <Input
              {...input}
              {...field}
              className={inputClassName}
              value={field.value ?? ""}
              onChange={(e) => {
                field.onChange(e);
                onValueChange?.(e.target.value);
              }}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** Amount input: decimal keypad on phones, right-aligned tabular figures. */
export function MoneyField({ inputClassName, ...props }: React.ComponentProps<typeof TextField>) {
  return (
    <TextField
      inputMode="decimal"
      autoComplete="off"
      placeholder="0"
      {...props}
      inputClassName={cn("text-right font-mono tabular-nums", inputClassName)}
    />
  );
}

export function TextareaField({
  name,
  label,
  required,
  description,
  className,
  inputClassName,
  onValueChange,
  ...input
}: Common &
  Omit<React.ComponentProps<typeof Textarea>, "name" | "className"> & {
    inputClassName?: string;
    onValueChange?: (v: string) => void;
  }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <Label label={label} required={required} />
          <FormControl>
            <Textarea
              {...input}
              {...field}
              className={inputClassName}
              value={field.value ?? ""}
              onChange={(e) => {
                field.onChange(e);
                onValueChange?.(e.target.value);
              }}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function ComboboxField({
  name,
  label,
  required,
  description,
  className,
  onValueChange,
  triggerClassName,
  ...combo
}: Common &
  Omit<React.ComponentProps<typeof Combobox>, "name" | "value" | "defaultValue" | "className"> & {
    triggerClassName?: string;
  }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <Label label={label} required={required} />
          <FormControl>
            <Combobox
              {...combo}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onValueChange={(v) => {
                field.onChange(v);
                onValueChange?.(v);
              }}
              className={triggerClassName}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function DateField({
  name,
  label,
  required,
  description,
  className,
  triggerClassName,
  ...picker
}: Common &
  Omit<React.ComponentProps<typeof DatePicker>, "name" | "value" | "defaultValue" | "className"> & {
    triggerClassName?: string;
  }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <Label label={label} required={required} />
          <FormControl>
            <DatePicker
              {...picker}
              ref={field.ref}
              name={field.name}
              value={field.value ?? ""}
              onBlur={field.onBlur}
              onValueChange={field.onChange}
              clearable={picker.clearable ?? !required}
              className={triggerClassName}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** One on/off checkbox (submits "on" when checked, like a native checkbox). */
export function CheckboxField({
  name,
  label,
  description,
  className,
  disabled,
}: Omit<Common, "required"> & { disabled?: boolean }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn("flex items-start gap-3", className)}>
          <FormControl>
            <Checkbox
              ref={field.ref}
              name={field.name}
              checked={!!field.value}
              onCheckedChange={(v) => field.onChange(v === true)}
              onBlur={field.onBlur}
              disabled={disabled}
              className="mt-0.5"
            />
          </FormControl>
          <div className="space-y-1">
            <FormLabel className="font-normal">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </div>
        </FormItem>
      )}
    />
  );
}

/** Checkbox group -> repeated `name=value` entries (e.g. siteInchargeIds). Value is string[]. */
export function CheckboxGroupField({
  name,
  label,
  description,
  className,
  options,
  itemClassName,
}: Omit<Common, "required"> & { options: ComboboxOption[]; itemClassName?: string }) {
  const { control } = useFormContext();
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => {
        const selected: string[] = Array.isArray(field.value) ? field.value : [];
        return (
          <FormItem className={className}>
            {label && <FormLabel>{label}</FormLabel>}
            {description && <FormDescription>{description}</FormDescription>}
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/50 has-[[data-state=checked]]:border-primary/40 has-[[data-state=checked]]:bg-primary/5",
                    itemClassName,
                  )}
                >
                  <Checkbox
                    name={field.name}
                    value={o.value}
                    checked={selected.includes(o.value)}
                    onCheckedChange={(v) =>
                      field.onChange(v === true ? [...selected, o.value] : selected.filter((x) => x !== o.value))
                    }
                  />
                  <span>
                    {o.label}
                    {o.hint && <span className="ml-1 text-muted-foreground">{o.hint}</span>}
                  </span>
                </label>
              ))}
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}
