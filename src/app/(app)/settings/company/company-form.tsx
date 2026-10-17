"use client";

import { useFormContext } from "react-hook-form";
import { ActionForm, CheckboxField, TextareaField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { companySettingsSchema } from "@/lib/validation/settings";
import type { AppSettings } from "@/server/services/settings-service";
import { saveCompanySettings } from "../actions";

type Values = {
  companyName: string;
  companyAddress: string;
  currencyLabel: string;
  autoApprovePrivileged: boolean;
  removeLogo: boolean;
};

/** On/off setting as a shadcn Switch (submits "on" when checked, like the old checkbox). */
function AutoApproveSwitch() {
  const { control } = useFormContext<Values>();
  return (
    <FormField
      control={control}
      name="autoApprovePrivileged"
      render={({ field }) => (
        <FormItem className="flex items-start justify-between gap-4 rounded-lg border border-border/60 p-4">
          <div className="space-y-1">
            <FormLabel>Auto-approve Admin / Accountant entries</FormLabel>
            <FormDescription>
              Expenses entered by an Admin or Accountant are approved immediately. Site In-charge entries always need
              approval.
            </FormDescription>
          </div>
          <FormControl>
            <Switch
              ref={field.ref}
              name={field.name}
              checked={!!field.value}
              onCheckedChange={field.onChange}
              onBlur={field.onBlur}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

export function CompanyForm({ settings }: { settings: AppSettings }) {
  const f = useActionForm<Values>(saveCompanySettings, companySettingsSchema, {
    defaultValues: {
      companyName: settings.companyName,
      companyAddress: settings.companyAddress ?? "",
      currencyLabel: settings.currencyLabel,
      autoApprovePrivileged: settings.autoApprovePrivileged,
      removeLogo: false,
    },
  });

  return (
    <ActionForm f={f} className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Name, address and logo appear on PDF reports.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TextField name="companyName" label="Company name" required />
          <TextareaField name="companyAddress" label="Address" rows={3} />
          <div className="grid gap-2">
            <Label htmlFor="logo">Logo</Label>
            {settings.logoPath && (
              <div className="flex items-center gap-4 rounded-lg border border-border/60 bg-muted/30 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-checked route */}
                <img
                  src={`/api/settings/logo?v=${encodeURIComponent(settings.logoPath)}`}
                  alt="Company logo"
                  className="h-16 w-auto rounded border border-border bg-white p-1"
                />
                <CheckboxField name="removeLogo" label="Remove logo" />
              </div>
            )}
            <Input id="logo" name="logo" type="file" accept="image/jpeg,image/png" className="h-auto cursor-pointer py-1.5" />
            <p className="text-xs text-muted-foreground">JPG or PNG, max 5 MB. Printed on PDF reports.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <AutoApproveSwitch />
          <TextField name="currencyLabel" label="Currency label" required className="max-w-40" inputClassName="font-mono" />
        </CardContent>
      </Card>

      <Button type="submit" disabled={f.pending}>
        {f.pending ? "Saving…" : "Save settings"}
      </Button>
    </ActionForm>
  );
}
