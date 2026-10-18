"use client";

import Link from "next/link";
import { DeleteButton } from "@/components/forms/delete-button";
import {
  ActionForm,
  CheckboxGroupField,
  ComboboxField,
  DateField,
  MoneyField,
  TextareaField,
  TextField,
} from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ActionState } from "@/lib/forms";
import { PROJECT_STATUS_LABELS, PROJECT_STATUSES, projectSchema, type ProjectStatus } from "@/lib/validation/projects";

export type ProjectFormValues = {
  code: string;
  name: string;
  clientName: string;
  projectManager: string;
  location: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  status: ProjectStatus;
  budget: string;
  notes: string;
  siteInchargeIds: number[];
  isHeadOffice: boolean;
};

/** RHF values mirror the HTML form: strings, checkbox group as string[]. */
type FormValues = {
  code: string;
  name: string;
  clientName: string;
  projectManager: string;
  location: string;
  startDate: string;
  endDate: string;
  status: string;
  budget: string;
  notes: string;
  siteInchargeIds: string[];
};

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  deleteAction?: () => Promise<ActionState>;
  values?: ProjectFormValues;
  siteIncharges: { id: number; name: string; username: string }[];
  cancelHref: string;
};

export function ProjectForm({ action, deleteAction, values, siteIncharges, cancelHref }: Props) {
  const isHeadOffice = values?.isHeadOffice ?? false;
  const f = useActionForm<FormValues>(action, projectSchema, {
    defaultValues: {
      code: values?.code ?? "",
      name: values?.name ?? "",
      clientName: values?.clientName ?? "",
      projectManager: values?.projectManager ?? "",
      location: values?.location ?? "",
      startDate: values?.startDate ?? "",
      endDate: values?.endDate ?? "",
      status: values?.status ?? "ACTIVE",
      budget: values?.budget ?? "",
      notes: values?.notes ?? "",
      siteInchargeIds: values?.siteInchargeIds.map(String) ?? [],
    },
  });

  return (
    <ActionForm f={f} className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Project details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            name="code"
            label="Code"
            required
            description={isHeadOffice ? "Built-in cost center code cannot change" : "Unique, e.g. PRJ-005"}
            readOnly={isHeadOffice}
            inputClassName="font-mono uppercase"
          />
          <TextField name="name" label="Name" required />
          <TextField name="clientName" label="Client name" />
          <TextField name="projectManager" label="Project manager" />
          <TextField name="location" label="Location" />
          <DateField name="startDate" label="Start date" required />
          <DateField name="endDate" label="End date" />
          <ComboboxField
            name="status"
            label="Status"
            required
            description="Completed projects are locked: no new expenses can be posted."
            options={PROJECT_STATUSES.filter((s) => !(isHeadOffice && s === "COMPLETED")).map((s) => ({
              value: s,
              label: PROJECT_STATUS_LABELS[s],
            }))}
          />
          <MoneyField
            name="budget"
            label="Contract value / budget (PKR)"
            description="Optional" placeholder="e.g. 5000000" />
          <TextareaField name="notes" label="Notes" rows={3} className="sm:col-span-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Site In-charges</CardTitle>
          <CardDescription>
            Assigned users can see this project and enter expenses for it. Admins and Accountants always see every
            project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {siteIncharges.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active Site In-charge users. Create them under Settings → Users.</p>
          ) : (
            <CheckboxGroupField
              name="siteInchargeIds"
              label={null}
              options={siteIncharges.map((u) => ({ value: String(u.id), label: u.name, hint: `@${u.username}` }))}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-start gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : values ? "Save changes" : "Create project"}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "outline" })}>
          Cancel
        </Link>
        {deleteAction && !isHeadOffice && (
          <DeleteButton
            action={deleteAction}
            title="Delete this project?"
            confirmText="Delete this project? This is only allowed when it has no expenses."
            label="Delete project"
            className="sm:ml-auto"
          />
        )}
      </div>
    </ActionForm>
  );
}
