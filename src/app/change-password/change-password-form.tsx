"use client";

import { z } from "zod";
import { ActionForm, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "./actions";

// Client-side mirror of the server action's checks, for instant feedback only. The action
// re-validates everything (its schema stays the source of truth) and redirects on success.
const clientSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Confirm the new password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

type Values = { currentPassword: string; newPassword: string; confirmPassword: string };

export function ChangePasswordForm() {
  const f = useActionForm<Values>(changePasswordAction, clientSchema, {
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  return (
    <ActionForm f={f} className="grid gap-4">
      <TextField name="currentPassword" label="Current password" type="password" autoComplete="current-password" required />
      <TextField
        name="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        description="At least 8 characters"
      />
      <TextField name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" required />
      <Button type="submit" className="w-full" disabled={f.pending}>
        {f.pending ? "Saving…" : "Change password"}
      </Button>
    </ActionForm>
  );
}
