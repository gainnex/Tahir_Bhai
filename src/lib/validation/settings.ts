import { z } from "zod";
import { ROLES } from "@/lib/permissions";
import { checkbox, optionalText, requiredText } from "@/lib/forms";

export const companySettingsSchema = z.object({
  companyName: requiredText("Company name", 150),
  companyAddress: optionalText(500),
  currencyLabel: requiredText("Currency label", 10),
  autoApprovePrivileged: checkbox,
  removeLogo: checkbox,
});
export type CompanySettingsInput = z.output<typeof companySettingsSchema>;

// ---- Users ----

const username = z
  .string({ error: "Username is required" })
  .trim()
  .toLowerCase()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username is too long (max 30 characters)")
  .regex(/^[a-z0-9._-]+$/, "Username may only contain letters, numbers, dot, dash and underscore");

const email = z
  .string()
  .trim()
  .toLowerCase()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || z.email().safeParse(v).success, "Enter a valid email address");

const password = z.string().min(8, "Password must be at least 8 characters");

const userFields = {
  name: requiredText("Name", 100),
  username,
  email,
  role: z.enum(ROLES, { error: "Select a role" }),
};

export const createUserSchema = z
  .object({ ...userFields, password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type CreateUserInput = z.output<typeof createUserSchema>;

export const updateUserSchema = z.object({ ...userFields, isActive: checkbox });
export type UpdateUserInput = z.output<typeof updateUserSchema>;

export const resetPasswordSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// ---- Expense heads ----

export const headNameSchema = z.object({ name: requiredText("Name", 100) });
