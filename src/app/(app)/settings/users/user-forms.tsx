"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, ComboboxField, TextField } from "@/components/forms/fields";
import { useActionForm } from "@/components/forms/use-action-form";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "@/lib/validation/settings";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

export type UserFormValues = {
  name: string;
  username: string;
  email: string | null;
  role: Role;
  isActive: boolean;
};

type Values = {
  name: string;
  username: string;
  email: string;
  role: string;
  password: string;
  confirmPassword: string;
  isActive: boolean;
};

const roleOptions = ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

/** Create (no `user`) or edit (with `user`). */
export function UserForm({ action, user, isSelf }: { action: Action; user?: UserFormValues; isSelf?: boolean }) {
  const f = useActionForm<Values>(action, user ? updateUserSchema : createUserSchema, {
    defaultValues: {
      name: user?.name ?? "",
      username: user?.username ?? "",
      email: user?.email ?? "",
      role: user?.role ?? "SITE_INCHARGE",
      password: "",
      confirmPassword: "",
      isActive: user?.isActive ?? true,
    },
  });

  return (
    <ActionForm f={f} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Full name" required />
        <TextField
          name="username"
          label="Username"
          required
          description="Used to log in"
          autoCapitalize="none"
          inputClassName="font-mono"
        />
        <TextField name="email" label="Email" type="email" description="Optional; can also be used to log in" />
        <ComboboxField name="role" label="Role" required options={roleOptions} />
        {!user && (
          <>
            <TextField
              name="password"
              label="Password"
              required
              type="password"
              autoComplete="new-password"
              description="At least 8 characters. The user changes it at first login."
            />
            <TextField name="confirmPassword" label="Confirm password" required type="password" autoComplete="new-password" />
          </>
        )}
      </div>
      {user && (
        <>
          <CheckboxField
            name="isActive"
            label="Active"
            description={isSelf ? "You cannot deactivate your own account." : "Inactive users cannot log in."}
            disabled={isSelf}
          />
          {/* A disabled checkbox is not submitted; keep self active. */}
          {isSelf && <input type="hidden" name="isActive" value="on" />}
        </>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={f.pending}>
          {f.pending ? "Saving…" : user ? "Save changes" : "Create user"}
        </Button>
        <Link href="/settings/users" className={buttonVariants({ variant: "outline" })}>
          {user ? "Back" : "Cancel"}
        </Link>
      </div>
    </ActionForm>
  );
}

export function ResetPasswordForm({ action }: { action: Action }) {
  const f = useActionForm<{ password: string; confirmPassword: string }>(action, resetPasswordSchema, {
    resetOnSuccess: true,
    defaultValues: { password: "", confirmPassword: "" },
  });
  return (
    <ActionForm f={f} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="password" label="New password" required type="password" autoComplete="new-password" />
        <TextField name="confirmPassword" label="Confirm password" required type="password" autoComplete="new-password" />
      </div>
      <Button type="submit" variant="outline" disabled={f.pending}>
        {f.pending ? "Resetting…" : "Reset password"}
      </Button>
    </ActionForm>
  );
}
