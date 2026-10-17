"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { errorMessage } from "@/lib/errors";
import { requireUser } from "@/server/auth";
import { changeOwnPassword, MIN_PASSWORD_LENGTH } from "@/server/services/auth-service";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { message: "New passwords do not match" });

export type ChangePasswordState = { error?: string };

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    await changeOwnPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  } catch (e) {
    return { error: errorMessage(e) };
  }
  redirect("/?passwordChanged=1");
}
